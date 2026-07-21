interface PluginInput {
    directory: string;
    client: {
        tui?: {
            showToast?: (input: {
                body: {
                    title?: string;
                    message: string;
                    variant?: 'info' | 'success' | 'warning' | 'error';
                };
            }) => Promise<unknown>;
        };
    };
}
interface PluginOutput {
    name: string;
    config?: (input: {
        logLevel?: string;
    }) => Promise<void>;
}
declare function export_default(ctx: PluginInput): Promise<PluginOutput>;

export { export_default as default };
