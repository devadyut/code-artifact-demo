import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, SelectObjectContentCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

class StorageService {
    constructor() {
        this.client = new S3Client({
            region: process.env['REGION'] || 'eu-west-1'
        });
    }

    handleError(error, methodName, options = {}) {
        const serviceName = this.constructor.name;
        console.error(`[${serviceName}.${methodName}] Error:`, {
            message: error.message,
            code: error.code || error.name,
            statusCode: error.$metadata?.httpStatusCode,
            requestId: error.$metadata?.requestId
        });
        
        // If a fallback value is provided, return it instead of throwing
        if (options.fallback !== undefined) {
            return options.fallback;
        }
        
        throw error;
    }

    async listBucket(params) {
        const command = new ListObjectsV2Command(params);

        try {
            const data = await this.client.send(command);
            return data.CommonPrefixes.map((commonPrefix) => {
                return commonPrefix.Prefix.substring(params.Prefix.length).replace('/', '');
            });
        } catch (error) {
            return this.handleError(error, 'listBucket', { fallback: [] });
        }
    }

    async listFolder(params) {
        const command = new ListObjectsV2Command(params);

        try {
            const data = await this.client.send(command);
            return data.Contents.map((object) => {
                return object.Key.substring(params.Prefix.length);
            });
        } catch (error) {
            return this.handleError(error, 'listFolder', { fallback: [] });
        }
    }

    async getObject(params) {
        const command = new GetObjectCommand(params);

        try {
            return await this.client.send(command);
        } catch (error) {
            return this.handleError(error, 'getObject', { fallback: null });
        }
    }

    async putObjectSignedUrl(params) {
        const command = new PutObjectCommand(params);

        try {
            return await getSignedUrl(this.client, command, { expiresIn: 3600 });
        } catch (error) {
            this.handleError(error, 'putObjectSignedUrl');
        }
    }

    async getObjectSignedUrl(params) {
        const command = new GetObjectCommand(params);

        try {
            return await getSignedUrl(this.client, command, { expiresIn: 3600 });
        } catch (error) {
            this.handleError(error, 'getObjectSignedUrl');
        }
    }

    async putObject(params) {
        const command = new PutObjectCommand(params);

        try {
            return await this.client.send(command);
        } catch (error) {
            this.handleError(error, 'putObject');
        }
    }

    async deleteObject(params) {
        const command = new DeleteObjectCommand(params);

        try {
            return await this.client.send(command);
        } catch (error) {
            this.handleError(error, 'deleteObject');
        }
    }

    async selectObjectContent(params) {
        const command = new SelectObjectContentCommand(params);

        try {
            return await this.client.send(command);
        } catch (error) {
            return this.handleError(error, 'selectObjectContent', { fallback: null });
        }
    }

    async headObject(params) {
        const command = new HeadObjectCommand(params);

        try {
            return await this.client.send(command);
        } catch (error) {
            return this.handleError(error, 'headObject', { fallback: null });
        }
    }

     async operation(action, object, data) {
        const bucketName = process.env['S3_BUCKET'];
        const key = `${process.env['ENVIRONMENT']}/${process.env['SERVICE_NAME']}/${object}.json`;
        let response;
        let params;
        try {
            switch(action) {
                case 'getObject':
                    params = {
                        Bucket: bucketName,
                        Key: key
                    }
                    response = await getObject(params);
                    break;
                case 'putObject':
                    params = {
                        Bucket: bucketName,
                        Key: key,
                        Body: JSON.stringify(data),
                        ContentType: 'application/json',
                    }
                    response = await putObject(params);
                    break;
                case 'deleteObject':
                    params = {
                        Bucket: bucketName,
                        Key: key
                    }
                    response = await deleteObject(params);
                    break;
                case 'selectObjectContent':
                    params = {
                        Bucket: bucketName,
                        Key: key,
                        ExpressionType: 'SQL',
                        Expression: data,
                        InputSerialization: {
                            CompressionType: 'NONE',
                            JSON: {
                                Type: 'DOCUMENT'
                            }
                        },
                        OutputSerialization: {
                            JSON: {}
                        }
                    }
                    response = await selectObjectContent(params);
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
const storageService = new StorageService();
export const listBucket = (params) => storageService.listBucket(params);
export const listFolder = (params) => storageService.listFolder(params);
export const getObject = (params) => storageService.getObject(params);
export const putObjectSignedUrl = (params) => storageService.putObjectSignedUrl(params);
export const getObjectSignedUrl = (params) => storageService.getObjectSignedUrl(params);
export const putObject = (params) => storageService.putObject(params);
export const deleteObject = (params) => storageService.deleteObject(params);
export const selectObjectContent = (params) => storageService.selectObjectContent(params);
export const headObject = (params) => storageService.headObject(params);
export const operation = (action, object, data) => storageService.operation(action, object, data);

// Also export as default for backward compatibility
export default StorageService;