import ivm from 'isolated-vm';

export interface ScriptExecutionResult {
    success: boolean;
    result?: any;
    error?: string;
    logs: string[];
}

export async function executeWebhookScript(
    scriptCode: string,
    eventPayload: any
): Promise<ScriptExecutionResult> {
    const logs: string[] = [];

    try {
        // Create a new isolate with 128MB memory limit
        const isolate = new ivm.Isolate({ memoryLimit: 128 });

        // Create context and get global object
        const context = await isolate.createContext();
        const jail = context.global;

        // Make global object identical to the standard global object in the VM
        await jail.set('global', jail.derefInto());

        // Expose a basic console.log
        await jail.set('console', new ivm.Reference({
            log: (...args: any[]) => {
                logs.push(args.map(a => String(a)).join(' '));
            },
            error: (...args: any[]) => {
                logs.push('[ERROR] ' + args.map(a => String(a)).join(' '));
            }
        }));

        // Provide a basic fetch capability (can be expanded later, synchronous for simplicity in VM eval, or mock it)
        // For now, webhook logic is usually pure data transformation. Complex async fetch inside isolated-vm requires more setup.

        // Compile the script
        const script = await isolate.compileScript(`
            // Wrapper to map the global object for logging
            const console = {
                log: (...args) => $console.getSync('log').applySync(undefined, args, { arguments: { copy: true } }),
                error: (...args) => $console.getSync('error').applySync(undefined, args, { arguments: { copy: true } })
            };

            ${scriptCode}

            // Expose the doPost function out of the scope
            if (typeof doPost !== 'function') {
                throw new Error("Your script must define a function named 'doPost(event)'");
            }
            
            // Register an entry point we can call from Node
            var __run_entry_point = function(eventPayloadString) {
                const event = JSON.parse(eventPayloadString);
                return JSON.stringify(doPost(event));
            };
        `);

        // Inject the Reference to Node console wrapper
        await context.evalClosure(`
            global.$console = $0;
        `, [
            new ivm.Reference({
                log: (...args: any[]) => logs.push(args.map(a => String(a)).join(' ')),
                error: (...args: any[]) => logs.push('[ERROR] ' + args.map(a => String(a)).join(' '))
            })
        ], { arguments: { reference: true } });


        // Run the script evaluation (creates the functions)
        await script.run(context, { timeout: 1000 });

        // Retrieve the executed entry point function
        const runner = await context.eval(`__run_entry_point`);
        if (typeof runner !== 'function') throw new Error("Could not initialize entry point.");

        // Call the runner with our stringified payload (isolated-vm handles strings securely across boundaries)
        const payloadString = JSON.stringify(eventPayload);

        // Execute the user's script with a strict timeout of 3000ms
        const resultString = await runner.apply(undefined, [payloadString], {
            timeout: 3000,
        });

        const parsedResult = JSON.parse(resultString);
        return {
            success: true,
            result: parsedResult,
            logs
        };
    } catch (error: any) {
        console.error('[ScriptExecutor] VM Error:', error);
        return {
            success: false,
            error: error.message || String(error),
            logs
        };
    }
}
