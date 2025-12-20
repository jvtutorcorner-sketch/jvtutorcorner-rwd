// lib/carousel.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'jvtutorcorner-carousel';

export interface CarouselImage {
  id: string;
  url: string;
  alt: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export async function getCarouselImages(): Promise<CarouselImage[]> {
  try {
    const command = new ScanCommand({
      TableName: TABLE_NAME,
    });

    const response = await docClient.send(command);
    const items = response.Items || [];

    return items
      .map(item => item as CarouselImage)
      .sort((a, b) => a.order - b.order);
  } catch (error) {
    console.error('Error fetching carousel images:', error);
    return [];
  }
}

export async function addCarouselImage(image: Omit<CarouselImage, 'id' | 'createdAt' | 'updatedAt'>): Promise<CarouselImage | null> {
  try {
    const id = `carousel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const newImage: CarouselImage = {
      ...image,
      id,
      createdAt: now,
      updatedAt: now,
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: newImage,
    });

    await docClient.send(command);
    return newImage;
  } catch (error) {
    console.error('Error adding carousel image:', error);
    return null;
  }
}

export async function deleteCarouselImage(id: string): Promise<boolean> {
  try {
    const command = new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { id },
    });

    await docClient.send(command);
    return true;
  } catch (error) {
    console.error('Error deleting carousel image:', error);
    return false;
  }
}