/**
 * Base Command
 */
import {Logger} from "winston";

abstract class Command {
    /**
     * The first alias in the array is the main name of the command
     */
    private readonly aliases : string[];
    private readonly logger : Logger;
    protected constructor(aliases : string[], logger : Logger) {
        this.aliases = aliases;
        this.logger = logger;
    }
    abstract execute(params : string[], user) : string;

    /**
     * Check if the value matches any aliases of the command
     * @param value
     */
    public check(value : string) : boolean{
        return this.aliases.includes(value);
    }
}