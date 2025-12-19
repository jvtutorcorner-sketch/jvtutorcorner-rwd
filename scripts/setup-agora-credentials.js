#!/usr/bin/env node

/**
 * Script to set up Agora credentials in AWS Systems Manager Parameter Store
 * Run this script to securely store your Agora APP_ID and APP_CERTIFICATE
 *
 * Usage: node scripts/setup-agora-credentials.js
 */

const { SSMClient, PutParameterCommand } = require('@aws-sdk/client-ssm');
const fs = require('fs');
const path = require('path');

async function setupAgoraCredentials() {
  console.log('Setting up Agora credentials in AWS Systems Manager Parameter Store...');

  // Read from .env.local file
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env.local file not found. Please create it with your Agora credentials.');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const appIdMatch = envContent.match(/AGORA_APP_ID=(.+)/);
  const appCertMatch = envContent.match(/AGORA_APP_CERTIFICATE=(.+)/);

  if (!appIdMatch || !appCertMatch) {
    console.error('Error: AGORA_APP_ID or AGORA_APP_CERTIFICATE not found in .env.local');
    process.exit(1);
  }

  const appId = appIdMatch[1].trim();
  const appCertificate = appCertMatch[1].trim();

  if (appId.length !== 32 || appCertificate.length !== 32) {
    console.error('Error: Invalid Agora credential format. Both should be 32 characters long.');
    process.exit(1);
  }

  // Get AWS region from environment or use default
  const region = process.env.AWS_REGION || 'us-east-1';

  const ssmClient = new SSMClient({ region });

  try {
    console.log('Storing AGORA_APP_ID...');
    await ssmClient.send(new PutParameterCommand({
      Name: '/jvtutorcorner/agora/app_id',
      Value: appId,
      Type: 'SecureString',
      Description: 'Agora RTC APP ID for JV Tutor Corner',
      Overwrite: true
    }));

    console.log('Storing AGORA_APP_CERTIFICATE...');
    await ssmClient.send(new PutParameterCommand({
      Name: '/jvtutorcorner/agora/app_certificate',
      Value: appCertificate,
      Type: 'SecureString',
      Description: 'Agora RTC APP Certificate for JV Tutor Corner',
      Overwrite: true
    }));

    console.log('✅ Agora credentials successfully stored in AWS Systems Manager Parameter Store');
    console.log(`📍 Region: ${region}`);
    console.log('🔐 Parameters stored as SecureString (encrypted)');

  } catch (error) {
    console.error('❌ Failed to store credentials:', error.message);
    console.log('\nMake sure you have:');
    console.log('1. AWS CLI configured with appropriate permissions');
    console.log('2. IAM permissions to create SSM parameters');
    console.log('3. Correct AWS region set (use AWS_REGION environment variable)');
    process.exit(1);
  }
}

if (require.main === module) {
  setupAgoraCredentials();
}

module.exports = { setupAgoraCredentials };