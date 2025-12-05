import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'fast-csv';
import dotenv from 'dotenv';
import * as database from '@taleofddh/database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

let userProfileDeleteKeys = [];
let userProfileItems = [];
let userProfileGetKeys = [];
fs.createReadStream(path.resolve(__dirname, 'data', 'userProfile.csv'))
    .pipe(csv.parse({ headers: true }))
    .transform(data => ({
        userId: data.userId,
        identityId: data.identityId,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        email: data.email,
        address1: data.address1,
        address2: data.address2,
        city: data.city,
        postCode: data.postCode,
        countryCode: data.countryCode,
        phone: data.phone,
        about: data.about,
        communityList: JSON.parse(data.communityList),
        mailingFlag: data.mailingFlag.toUpperCase() === 'TRUE',
        updatedAt: data.updatedAt,
        lastLogin: data.lastLogin,
        roles: JSON.parse(data.roles)
    }))
    .on('error', error => console.error(error))
    .on('data', row => {
        userProfileDeleteKeys.push({
            DeleteRequest: {
                Key: {
                    "userId": row.userId
                }
            }
        });
        userProfileItems.push({
            PutRequest: {
                Item: {
                    "userId": row.userId,
                    "identityId": row.identityId,
                    "firstName": row.firstName,
                    "lastName": row.lastName,
                    "dateOfBirth": row.dateOfBirth,
                    "gender": row.gender,
                    "email": row.email,
                    "address1": row.address1,
                    "address2": row.address2,
                    "city": row.city,
                    "postCode": row.postCode,
                    "countryCode": row.countryCode,
                    "phone": row.phone,
                    "about": row.about,
                    "communityList": row.communityList,
                    "mailingFlag": row.mailingFlag,
                    "updatedAt": row.updatedAt,
                    "lastLogin": row.lastLogin,
                    "roles": row.roles
                }
            }
        });
        userProfileGetKeys.push({
            "userId": row.userId
        });
    })
    .on('end', async rowCount => {
        /*const commParams = {};
        const allCommunities = await database.operation("scanDocs", "community", commParams);
        allCommunities.sort((a, b) => (a.number > b.number) ? 1 : ((b.number > a.number) ? -1 : 0));
        for(i in userProfileItems) {
            let communityList = [];
            for(let j in allCommunities) {
                let match = false;
                let communities = JSON.parse(userProfileItems[i].PutRequest.Item.communityList);
                communities.sort((a, b) => (a.id > b.id) ? 1 : ((b.id > a.id) ? -1 : 0));
                for(let k in communities) {
                    //await console.log(communities[j]);
                    if(allCommunities[j].number === parseInt(communities[k].id)) {
                        match = communities[k].checked;
                    }
                }
                //console.log(match);
                if(match) {
                    communityList.push({"id": allCommunities[j].number, "name": allCommunities[j].name, "checked": true});
                } else {
                    communityList.push({"id": allCommunities[j].number, "name": allCommunities[j].name, "checked": false});
                }
            }
            userProfileItems[i].PutRequest.Item.communityList = communityList;
        }*/
        await database.operation("deleteItems", "userProfile", userProfileDeleteKeys);
        await database.operation("writeItems", "userProfile", userProfileItems);
        const docs = await database.operation("getItems", "userProfile", userProfileGetKeys);
        await console.log(docs);
        await console.log(`Parsed ${rowCount} rows`);
    });
