/**
 * Base Command
 */

export abstract class Command {
    /**
     * The first alias in the array is the main name of the command
     */
    private readonly aliases : string[];
    protected constructor(aliases : string[]) {
        this.aliases = aliases;
    }

    /**
     * Runs the command and sends back the result
     * @param params paramters to run the command
     * @param message original message that called the command
     */
    abstract execute(params : string[], message: Message) : string;

    /**
     * Check if the value matches any aliases of the command
     */
    public check(value : string) : boolean{
        return this.aliases.includes(value);
    }

    /**
     * Return all aliases of the command
     */
    public getAliases() : string[] {
        return this.aliases;
    }
}