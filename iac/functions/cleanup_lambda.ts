import { CloudFormationClient, DeleteStackCommand, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

/**
 * Lambda function to cleanup CloudFormation stack after 3 months of inactivity
 * This function is triggered by EventBridge Scheduler
 * 
 * The stack is configured with autoDeleteObjects: true, so CloudFormation
 * will automatically handle deletion of all S3 objects before deleting the bucket
 */

interface CleanupEvent {
  stackName: string;
}

const cfnClient = new CloudFormationClient({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * Check if stack exists
 */
async function stackExists(stackName: string): Promise<boolean> {
  try {
    const command = new DescribeStacksCommand({ StackName: stackName });
    const response = await cfnClient.send(command);
    
    if (response.Stacks && response.Stacks.length > 0) {
      const stackStatus = response.Stacks[0].StackStatus;
      // Stack exists if it's not in a DELETE_COMPLETE state
      return stackStatus !== 'DELETE_COMPLETE';
    }
    
    return false;
  } catch (error: any) {
    // Stack doesn't exist if we get ValidationError
    if (error.name === 'ValidationError') {
      return false;
    }
    throw error;
  }
}

/**
 * Delete CloudFormation stack
 */
async function deleteStack(stackName: string): Promise<void> {
  console.log(`Deleting CloudFormation stack: ${stackName}`);
  
  const command = new DeleteStackCommand({
    StackName: stackName,
  });

  await cfnClient.send(command);
  console.log(`Stack deletion initiated successfully: ${stackName}`);
  console.log('Note: CloudFormation will handle deletion of S3 objects via autoDeleteObjects custom resource');
}

/**
 * Main handler function
 */
export async function handler(event: CleanupEvent): Promise<{ statusCode: number; body: string }> {
  console.log('Starting cleanup lambda execution');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const { stackName } = event;
    
    console.log(`Stack name: ${stackName}`);

    // Check if stack exists
    const exists = await stackExists(stackName);
    
    if (!exists) {
      console.log(`Stack ${stackName} does not exist or is already deleted. Nothing to clean up.`);
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: `Stack ${stackName} does not exist or is already deleted. Nothing to clean up.`,
        }),
      };
    }

    await deleteStack(stackName);

    const successMessage = `Successfully initiated deletion of stack ${stackName}.`;
    console.log(successMessage);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: successMessage,
        stackName: stackName,
        note: 'Stack deletion is asynchronous. CloudFormation will handle all resource cleanup including S3 objects.',
      }),
    };
  } catch (error: any) {
    console.error('Error during cleanup:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error during cleanup',
        error: error.message,
        stack: error.stack,
      }),
    };
  }
}
