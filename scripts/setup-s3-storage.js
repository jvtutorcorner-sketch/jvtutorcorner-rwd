// scripts/setup-s3-storage.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Setting up AWS S3 storage for carousel images...');

// Check if amplify CLI is installed
try {
  execSync('amplify --version', { stdio: 'pipe' });
} catch (error) {
  console.error('AWS Amplify CLI is not installed. Please install it first:');
  console.error('npm install -g @aws-amplify/cli');
  process.exit(1);
}

// Check if we're in an amplify project
if (!fs.existsSync('amplify')) {
  console.error('This is not an Amplify project. Please run this from the project root.');
  process.exit(1);
}

console.log('Adding S3 storage to Amplify project...');

try {
  // Add storage with public read access for images
  execSync('amplify add storage', {
    input: '1\njvtutorcornerimages\n1\ny\ny\nn\ny\ny\nn\n',
    stdio: 'inherit'
  });

  console.log('Storage added successfully!');
  console.log('Run "amplify push" to deploy the storage to AWS.');
  console.log('');
  console.log('After deployment, update your .env file with:');
  console.log('- AWS_S3_BUCKET_NAME: The name of the created S3 bucket');
  console.log('- AWS_REGION: Your AWS region (from amplify configuration)');
  console.log('- AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY: Your AWS credentials');

} catch (error) {
  console.error('Failed to add storage:', error.message);
  console.log('');
  console.log('You can also manually add storage by running:');
  console.log('amplify add storage');
  console.log('Then select:');
  console.log('- Content (Images, audio, video, etc.)');
  console.log('- Bucket name: jvtutorcornerimages');
  console.log('- Auth users only: No');
  console.log('- Guest users: Yes (read and write)');
}