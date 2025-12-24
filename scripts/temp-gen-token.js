const {RtcTokenBuilder, RtcRole} = require('agora-access-token');
const appId = '5cbf2f6128cf4e5ea92e046e3c161621';
const appCertificate = '3f9ea1c4321646e0a38d634505806bd7';
const channelName = 'test-channel';
const uid = 1234;
const expireSeconds = 3600;
const currentTimestamp = Math.floor(Date.now() / 1000);
const privilegeTs = currentTimestamp + expireSeconds;

const token = RtcTokenBuilder.buildTokenWithUid(
  appId,
  appCertificate,
  channelName,
  uid,
  RtcRole.PUBLISHER,
  privilegeTs
);

console.log('--- AGORA TEST CREDENTIALS ---');
console.log('App ID:', appId);
console.log('Channel Name:', channelName);
console.log('Token:', token);
console.log('UID:', uid);
console.log('------------------------------');
