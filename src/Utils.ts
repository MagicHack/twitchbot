export default {
    getEnvValue(key :string) :string {
        const result = process.env[key];
        if(result === undefined) {
            throw `Error reading ${key} from .env file`;
        }
        return result;
    }
}