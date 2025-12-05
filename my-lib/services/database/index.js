import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, BatchWriteCommand, BatchGetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

class DatabaseService {
    constructor() {
        this.client = new DynamoDBClient({
            region: process.env['REGION'] || 'eu-west-1'
        });
        this.docClient = DynamoDBDocumentClient.from(this.client);
    }

    handleError(error, methodName, options = {}) {
        const serviceName = this.constructor.name;
        console.error(`[${serviceName}.${methodName}] Error:`, {
            message: error.message,
            code: error.code || error.name,
            statusCode: error.$metadata?.httpStatusCode,
            requestId: error.$metadata?.requestId
        });
        
        if (options.fallback !== undefined) {
            return options.fallback;
        }
        
        throw error;
    }

    async put(params) {
        const command = new PutCommand(params);

        try {
            return await this.docClient.send(command);
        } catch (error) {
            this.handleError(error, 'put');
        }
    }

    async get(params) {
        const command = new GetCommand(params);

        try {
            const data = await this.docClient.send(command);
            return data.Item;
        } catch (error) {
            return this.handleError(error, 'get', { fallback: null });
        }
    }

    async update(params) {
        const command = new UpdateCommand(params);

        try {
            const data = await this.docClient.send(command);
            return data.Attributes;
        } catch (error) {
            this.handleError(error, 'update');
        }
    }

    async delete(params) {
        const command = new DeleteCommand(params);

        try {
            return await this.docClient.send(command);
        } catch (error) {
            this.handleError(error, 'delete');
        }
    }

    async batchWrite(params) {
        const command = new BatchWriteCommand(params);

        try {
            return await this.docClient.send(command);
        } catch (error) {
            this.handleError(error, 'batchWrite');
        }
    }

    async batchGet(params, table) {
        const command = new BatchGetCommand(params);

        try {
            const data = await this.docClient.send(command);
            return data.Responses[table].map((item) => {
                return item;
            });
        } catch (error) {
            return this.handleError(error, 'batchGet', { fallback: [] });
        }
    }

    async query(params) {
        const command = new QueryCommand(params);

        try {
            const data = await this.docClient.send(command);
            return data.Items.map((item) => {
                return item;
            });
        } catch (error) {
            return this.handleError(error, 'query', { fallback: [] });
        }
    }

    async scan(params) {
        const command = new ScanCommand(params);

        try {
            const data = await this.docClient.send(command);
            return data.Items.map((item) => {
                return item;
            });
        } catch (error) {
            return this.handleError(error, 'scan', { fallback: [] });
        }
    }

    async operation(action, table, data) {
        let tableName = process.env['ENVIRONMENT'] + '.' + process.env['APP_NAME'] + '.' + process.env['SERVICE_NAME'] + '.' + table;
        let response;
        let params;
        try {
            switch (action) {
                case 'getItem':
                    data.TableName = tableName;
                    params = data;
                    response = await get(params);
                    break;
                case 'getItems':
                    params = {
                        "RequestItems": {
                            [tableName]: {
                                "Keys": data
                            }
                        }
                    }
                    response = await batchGet(params, tableName);
                    break;
                case 'writeItem':
                    data.TableName = tableName;
                    params = data;
                    response = await put(params);
                    break;
                case 'writeItems':
                    params = {
                        "RequestItems": {
                            [tableName]: data
                        }
                    }
                    response = await batchWrite(params);
                    break;
                case 'updateItem':
                    data.TableName = tableName;
                    params = data;
                    response = await update(params);
                    break;
                case 'updateItems':
                    params = {
                        "RequestItems": {
                            [tableName]: data
                        }
                    }
                    response = await batchWrite(params);
                    break;
                case 'deleteItem':
                    data.TableName = tableName;
                    params = data;
                    response = await deleteItem(params);
                    break;
                case 'deleteItems':
                    params = {
                        "RequestItems": {
                            [tableName]: data
                        }
                    }
                    response = await batchWrite(params);
                    break;
                case 'queryItems':
                    data.TableName = tableName
                    params = data;
                    response = await query(params);
                    break;
                case 'scanItems':
                    data.TableName = tableName
                    params = data;
                    response = await scan(params);
                    break;
                default:
                    break;
            }
            return response;
        } catch (error) {
            console.error(error);
        }
    }
}

// Export a singleton instance
const databaseService = new DatabaseService();
export const put = (params) => databaseService.put(params);
export const get = (params) => databaseService.get(params);
export const update = (params) => databaseService.update(params);
export const deleteItem = (params) => databaseService.delete(params);
export const batchWrite = (params) => databaseService.batchWrite(params);
export const batchGet = (params, table) => databaseService.batchGet(params, table);
export const query = (params) => databaseService.query(params);
export const scan = (params) => databaseService.scan(params);
export const operation = (action, table, data) => databaseService.operation(action, table, data);

// Also export the class for backward compatibility
export { DatabaseService as Database };