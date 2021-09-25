export default {
    getEnvValue(key :string) :string {
        const result = process.env[key];
        if(result === undefined) {
            throw `Error reading ${key} from .env file`;
        }
        return result;
    },
    splitNoEmpty(value: string, separator: string): string[]{
        return value.split(separator).filter(val => val.length !== 0);
    }
}