import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB Client (Shared Logic)
function getDBClient() {
  const REGION = process.env.CI_AWS_REGION || process.env.AWS_REGION || 'ap-northeast-1';
  
  const clientConfig: any = { region: REGION };
  
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
  
  if (accessKeyId && secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId,
      secretAccessKey
    };
  }
  
  const client = new DynamoDBClient(clientConfig);
  return DynamoDBDocumentClient.from(client);
}

export interface CarouselImage {
  id: string;
  url: string;
  alt: string;
  order: number;
}

export async function getCarouselImages(): Promise<CarouselImage[]> {
  const TABLE_NAME = process.env.DYNAMODB_TABLE_CAROUSEL || 'jvtutorcorner-carousel';
  const docClient = getDBClient();

  try {
    const command = new ScanCommand({ TableName: TABLE_NAME });
    const response = await docClient.send(command);
    
    const items = (response.Items || []) as CarouselImage[];
    
    // Sort by order
    return items.sort((a, b) => (a.order || 0) - (b.order || 0));
  } catch (error) {
    console.error('[Carousel Lib] Failed to fetch images:', error);
    return [];
  }
}
