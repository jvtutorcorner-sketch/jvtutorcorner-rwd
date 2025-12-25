#!/bin/bash

# Script to create DynamoDB tables for JV Tutor Corner
# Run this script in your AWS environment with appropriate permissions

# Set your AWS region
REGION="us-east-1"

echo "Creating DynamoDB tables..."

# Create teachers table
aws dynamodb create-table \
  --table-name jvtutorcorner-teachers \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=location,AttributeType=S \
    AttributeName=rating,AttributeType=N \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes \
    "[
      {
        \"IndexName\": \"LocationRatingIndex\",
        \"KeySchema\": [
          {\"AttributeName\": \"location\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"rating\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"}
      }
    ]" \
  --region $REGION

# Create courses table
aws dynamodb create-table \
  --table-name jvtutorcorner-courses \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=subject,AttributeType=S \
    AttributeName=teacherName,AttributeType=S \
    AttributeName=nextStartDate,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes \
    "[
      {
        \"IndexName\": \"SubjectStartDateIndex\",
        \"KeySchema\": [
          {\"AttributeName\": \"subject\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"nextStartDate\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"}
      },
      {
        \"IndexName\": \"TeacherNameIndex\",
        \"KeySchema\": [
          {\"AttributeName\": \"teacherName\", \"KeyType\": \"HASH\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"}
      }
    ]" \
  --region $REGION

# Create orders table
aws dynamodb create-table \
  --table-name jvtutorcorner-orders \
  --attribute-definitions \
    AttributeName=orderId,AttributeType=S \
    AttributeName=userId,AttributeType=S \
    AttributeName=courseId,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema \
    AttributeName=orderId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes \
    "[
      {
        \"IndexName\": \"UserIdIndex\",
        \"KeySchema\": [
          {\"AttributeName\": \"userId\", \"KeyType\": \"HASH\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"}
      },
      {
        \"IndexName\": \"CourseIdIndex\",
        \"KeySchema\": [
          {\"AttributeName\": \"courseId\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"createdAt\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"}
      }
    ]" \
  --region $REGION

# Create enrollments table
aws dynamodb create-table \
  --table-name jvtutorcorner-enrollments \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=userId,AttributeType=S \
    AttributeName=courseId,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes \
    "[
      {
        \"IndexName\": \"UserIdIndex\",
        \"KeySchema\": [
          {\"AttributeName\": \"userId\", \"KeyType\": \"HASH\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"}
      },
      {
        \"IndexName\": \"CourseIdIndex\",
        \"KeySchema\": [
          {\"AttributeName\": \"courseId\", \"KeyType\": \"HASH\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"}
      }
    ]" \
  --region $REGION

# Create carousel table
aws dynamodb create-table \
  --table-name jvtutorcorner-carousel \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region $REGION

echo "All DynamoDB tables created successfully!"
echo "Now redeploy your Amplify application to pick up the new environment variables."