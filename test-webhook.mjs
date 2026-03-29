import { executeWebhookScript } from './lib/scriptExecutor.ts';

async function test() {
  const script = `
    function doPost(event) {
      if (event.events && event.events[0] && event.events[0].message) {
        return "You said: " + event.events[0].message.text;
      }
      return "No message";
    }
  `;

  console.log("Testing basic script...");
  const result = await executeWebhookScript(script, {
    events: [{
      type: 'message',
      message: {
        type: 'text',
        text: 'Hello World!'
      }
    }]
  });
  console.log("Result:", result);

  console.log("\nTesting dangerous script (infinite loop)...");
  try {
    const res = await executeWebhookScript(`
      function doPost() {
        while(true) {}
      }
    `, {});
    console.log("Returned:", res);
  } catch (e) {
    console.log("Caught infinite loop error:", e.message);
  }

  console.log("\nTesting dangerous script (process parsing)...");
  try {
    const res = await executeWebhookScript(`
      function doPost() {
        return process.env;
      }
    `, {});
    console.log("Returned:", res);
  } catch (e) {
    console.log("Caught process error:", e.message);
  }
}

test();
