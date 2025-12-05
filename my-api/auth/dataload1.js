import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'fast-csv';
import dotenv from 'dotenv';
import * as database from '@taleofddh/database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

let communityDeleteKeys = [];
let communityItems = [];
let communityGetKeys = [];
fs.createReadStream(path.resolve(__dirname, 'data', 'community.csv'))
    .pipe(csv.parse({ headers: true }))
    .transform(data => ({
        number: parseInt(data.number),
        name: data.name
    }))
    .on('error', error => console.error(error))
    .on('data', row => {
        communityDeleteKeys.push({
            DeleteRequest: {
                Key: {
                    "name": row.name
                }
            }
        });
        communityItems.push({
            PutRequest: {
                Item: {
                    "number": row.number,
                    "name": row.name
                }
            }
        });
        communityGetKeys.push({
            "name": row.name
        });
    })
    .on('end', async rowCount => {
        await database.operation("deleteItems", "community", communityDeleteKeys);
        await database.operation("writeItems", "community", communityItems);
        const docs = await database.operation("getItems", "community", communityGetKeys);
        await console.log(docs);
        await console.log(`Parsed ${rowCount} rows`);
    });

/*let roleDeleteKeys = [];
let roleItems = [];
let roleGetKeys = [];
fs.createReadStream(path.resolve(__dirname, 'data', 'role.csv'))
    .pipe(csv.parse({ headers: true }))
    .transform(data => ({
        number: parseInt(data.number),
        code: data.code,
        name: data.name,
        type: data.type
    }))
    .on('error', error => console.error(error))
    .on('data', row => {
        roleDeleteKeys.push({
            DeleteRequest: {
                Key: {
                    "code": row.code
                }
            }
        });
        roleItems.push({
            PutRequest: {
                Item: {
                    "number": row.number,
                    "code": row.code,
                    "name": row.name,
                    "type": row.type
                }
            }
        });
        roleGetKeys.push({
            "code": row.code
        });
    })
    .on('end', async rowCount => {
        await database.operation("deleteItems", "role", roleDeleteKeys);
        await database.operation("writeItems", "role", roleItems);
        const docs = await database.operation("getItems", "role", roleGetKeys);
        await console.log(docs);
        await console.log(`Parsed ${rowCount} rows`);
    });*/
