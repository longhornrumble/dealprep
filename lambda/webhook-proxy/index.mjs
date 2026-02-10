/**
 * Webhook Proxy Lambda
 *
 * Receives webhooks and queues them for processing, ensuring no data is lost
 * even when EC2 instances are stopped.
 *
 * Two invocation modes:
 * 1. API Gateway → Queue message in SQS → Return 202 Accepted immediately
 * 2. SQS Trigger → Start EC2 if needed → Forward to n8n
 *
 * This architecture ensures:
 * - No data loss (payload persisted in SQS before returning)
 * - Fast response to callers (202 Accepted)
 * - Automatic retries with backoff
 * - Dead letter queue for failed messages
 */

import { EC2Client, DescribeInstancesCommand, StartInstancesCommand } from '@aws-sdk/client-ec2';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const ec2 = new EC2Client({ region: 'us-east-1' });
const sqs = new SQSClient({ region: 'us-east-1' });

// Configuration
const N8N_INSTANCE_ID = 'i-04281d9886e3a6c41';
const N8N_URL = 'http://98.89.202.33:5678'; // n8n Elastic IP
const SQS_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/614056832592/deal-prep-webhook-queue';
const MAX_WAIT_TIME = 180000; // 180 seconds max wait for n8n to start (SQS has 5 min visibility)
const POLL_INTERVAL = 5000; // Check every 5 seconds
const HEALTH_CHECK_TIMEOUT = 5000; // 5 second timeout for health checks

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get EC2 instance state
 */
async function getInstanceState(instanceId) {
  try {
    const command = new DescribeInstancesCommand({
      InstanceIds: [instanceId]
    });
    const response = await ec2.send(command);
    const instance = response.Reservations?.[0]?.Instances?.[0];
    return instance?.State?.Name || 'unknown';
  } catch (error) {
    console.error('[Proxy] Error getting instance state:', error.message);
    return 'unknown';
  }
}

/**
 * Start EC2 instance
 */
async function startInstance(instanceId) {
  try {
    const command = new StartInstancesCommand({
      InstanceIds: [instanceId]
    });
    await ec2.send(command);
    console.log('[Proxy] Start instance command sent for:', instanceId);
    return true;
  } catch (error) {
    console.error('[Proxy] Error starting instance:', error.message);
    return false;
  }
}

/**
 * Check if n8n is healthy
 */
async function checkN8nHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

    const response = await fetch(`${N8N_URL}/healthz`, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Ensure n8n server is running and healthy
 */
async function ensureN8nRunning() {
  console.log('[Proxy] Checking if n8n server is running...');

  // First check if already healthy (fast path)
  if (await checkN8nHealth()) {
    console.log('[Proxy] n8n already running and healthy');
    return { success: true, wasStarted: false, waitTime: 0 };
  }

  console.log('[Proxy] n8n not responding, checking EC2 state...');

  // Check instance state
  const state = await getInstanceState(N8N_INSTANCE_ID);
  console.log('[Proxy] n8n instance state:', state);

  if (state === 'stopped') {
    console.log('[Proxy] n8n instance stopped, starting...');
    const started = await startInstance(N8N_INSTANCE_ID);
    if (!started) {
      return { success: false, error: 'Failed to start n8n instance' };
    }
  } else if (state === 'stopping') {
    console.log('[Proxy] n8n instance is stopping, waiting...');
  } else if (state === 'pending') {
    console.log('[Proxy] n8n instance is pending, waiting...');
  }

  // Wait for n8n to be healthy
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_WAIT_TIME) {
    if (await checkN8nHealth()) {
      const waitTime = Date.now() - startTime;
      console.log(`[Proxy] n8n healthy after ${waitTime}ms`);
      return { success: true, wasStarted: true, waitTime };
    }
    console.log('[Proxy] Waiting for n8n to become healthy...');
    await sleep(POLL_INTERVAL);
  }

  return {
    success: false,
    error: 'Timeout waiting for n8n to become healthy',
    waitTime: MAX_WAIT_TIME
  };
}

/**
 * Forward webhook to n8n
 */
async function forwardToN8n(body, webhookPath) {
  const url = `${N8N_URL}${webhookPath}`;

  console.log('[Proxy] Forwarding request to:', url);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });

    const responseBody = await response.text();

    console.log('[Proxy] n8n response status:', response.status);

    return {
      statusCode: response.status,
      body: responseBody
    };
  } catch (error) {
    console.error('[Proxy] Error forwarding to n8n:', error.message);
    throw error;
  }
}

/**
 * Queue message in SQS
 */
async function queueMessage(body, webhookPath) {
  const command = new SendMessageCommand({
    QueueUrl: SQS_QUEUE_URL,
    MessageBody: typeof body === 'string' ? body : JSON.stringify(body),
    MessageAttributes: {
      'QueuedAt': {
        DataType: 'String',
        StringValue: new Date().toISOString()
      },
      'WebhookPath': {
        DataType: 'String',
        StringValue: webhookPath
      }
    }
  });

  const response = await sqs.send(command);
  console.log('[Proxy] Message queued with ID:', response.MessageId, 'path:', webhookPath);
  return response.MessageId;
}

/**
 * Handle API Gateway invocation - queue and return immediately
 */
async function handleApiGateway(event) {
  console.log('[Proxy] API Gateway invocation - queueing message');

  // CORS preflight
  if ((event.httpMethod || event.requestContext?.http?.method) === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  try {
    // Extract webhook path from request and map to n8n webhook path
    const requestPath = event.path || event.rawPath || '/deal-prep';
    const webhookPath = `/webhook${requestPath}`;

    // Queue the message immediately
    const messageId = await queueMessage(event.body, webhookPath);

    // Return 202 Accepted immediately
    return {
      statusCode: 202,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Request accepted and queued for processing',
        messageId: messageId,
        status: 'queued'
      })
    };
  } catch (error) {
    console.error('[Proxy] Error queueing message:', error.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to queue request',
        details: error.message
      })
    };
  }
}

/**
 * Handle SQS invocation - process queued messages
 */
async function handleSqs(event) {
  console.log('[Proxy] SQS invocation - processing', event.Records.length, 'message(s)');

  const results = [];

  for (const record of event.Records) {
    const messageId = record.messageId;
    console.log('[Proxy] Processing message:', messageId);

    try {
      // Ensure n8n is running
      const n8nStatus = await ensureN8nRunning();

      if (!n8nStatus.success) {
        console.error('[Proxy] Failed to start n8n:', n8nStatus.error);
        // Throw error to trigger SQS retry
        throw new Error(`n8n not available: ${n8nStatus.error}`);
      }

      // Forward to n8n using the webhook path from message attributes
      const webhookPath = record.messageAttributes?.WebhookPath?.stringValue || '/webhook/deal-prep';
      const response = await forwardToN8n(record.body, webhookPath);

      console.log('[Proxy] Message processed successfully:', messageId);
      results.push({ messageId, success: true, statusCode: response.statusCode });

    } catch (error) {
      console.error('[Proxy] Error processing message:', messageId, error.message);
      // Throw to trigger retry (message will return to queue)
      throw error;
    }
  }

  return { results };
}

/**
 * Lambda handler
 */
export const handler = async (event) => {
  console.log('[Proxy] Received invocation');

  // Determine invocation source
  if (event.Records && event.Records[0]?.eventSource === 'aws:sqs') {
    // SQS invocation - process the message
    return handleSqs(event);
  } else {
    // API Gateway invocation - queue and return
    console.log('[Proxy] Path:', event.path || event.rawPath);
    console.log('[Proxy] Method:', event.httpMethod || event.requestContext?.http?.method);
    return handleApiGateway(event);
  }
};
