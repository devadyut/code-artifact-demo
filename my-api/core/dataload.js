import fs from 'fs';
import path from 'path';
import csv from 'fast-csv';
import dotenv from 'dotenv';
import * as storage from '@taleofddh/storage';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

let menuObject = [];
fs.readFile('data/menu.json', 'utf8', async (err, data) => {
    menuObject = await JSON.parse(data);
    await storage.operation("deleteObject", "menu");
    await storage.operation("putObject", "menu", menuObject);
    const object = await storage.operation("getObject", "menu");
    console.log(await object.Body.transformToString());
});

let promotionObject = [];
fs.readFile('data/promotion.json', 'utf8', async (err, data) => {
    promotionObject = await JSON.parse(data);
    await storage.operation("deleteObject", "promotion");
    await storage.operation("putObject", "promotion", promotionObject);
    const object = await storage.operation("getObject", "promotion");
    console.log(await object.Body.transformToString());
});

let countryObject = [];
fs.createReadStream(path.resolve(__dirname, 'data', 'country.csv'))
    .pipe(csv.parse({ headers: true }))
    .transform(data => ({
        code: data.code,
        name: data.name
    }))
    .on('error', error => console.error(error))
    .on('data', row => {
        countryObject.push({
            "code": row.code,
            "name": row.name
        });
    })
    .on('end', async rowCount => {
        await storage.operation("deleteObject", "country");
        await storage.operation("putObject", "country", countryObject);
        const object = await storage.operation("getObject", "country");
        console.log(await object.Body.transformToString());
        console.log(`Parsed ${rowCount} rows`);
    });

let termsAndConditionsObject = [];
fs.readFile('data/termsAndConditions.json', 'utf8', async (err, data) => {
    termsAndConditionsObject = await JSON.parse(data);
    await storage.operation("deleteObject", "termsAndConditions");
    await storage.operation("putObject", "termsAndConditions", termsAndConditionsObject);
    const object = await storage.operation("getObject", "termsAndConditions");
    console.log(await object.Body.transformToString());
});

let privacyPolicyObject = [];
fs.readFile('data/privacyPolicy.json', 'utf8', async (err, data) => {
    privacyPolicyObject = await JSON.parse(data);
    await storage.operation("deleteObject", "privacyPolicy");
    await storage.operation("putObject", "privacyPolicy", privacyPolicyObject);
    const object = await storage.operation("getObject", "privacyPolicy");
    console.log(await object.Body.transformToString());
});

let frequentlyAskedQuestionObject = {};
fs.readFile('data/frequentlyAskedQuestion.json', 'utf8', async (err, data) => {
    frequentlyAskedQuestionObject = await JSON.parse(data);
    await storage.operation("deleteObject", "frequentlyAskedQuestion");
    await storage.operation("putObject", "frequentlyAskedQuestion", frequentlyAskedQuestionObject);
    const object = await storage.operation("getObject", "frequentlyAskedQuestion");
    console.log(await object.Body.transformToString());
});

/*let auditItem = {};
fs.readFile('data/audit.json', 'utf8', async (err, data) => {
    let auditList = await JSON.parse(data);
    let docPromises = {};
    docPromises = auditList.map(async (item) => {
        auditItem = {
            Item: {
                "date": item.date,
                "hostName": item.hostName,
                "countryCode": item.countryCode,
                "ipAddress": item.ipAddress,
                "page": item.page,
                "message": item.message
            }
        }
        const doc = await dbOperation("insertDoc", "audit", auditItem);
        return doc;
    });
    const docs = await Promise.all(docPromises);
    console.log(docs);
});*/
