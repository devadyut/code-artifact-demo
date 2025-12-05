'use strict';
import * as database from '@taleofddh/database';
import * as response from '@taleofddh/response';
const table = process.env['ENVIRONMENT'] + '.' + process.env['APP_NAME'] + '.' + process.env['SERVICE_NAME'] + '.' + process.env['TABLE_NAME'];

export const findIdentity = async (event) => {
    let userId = event.requestContext.identity.cognitoAuthenticationProvider.match(/CognitoSignIn:([^:]+)$/)[1];
    let identityId = event.requestContext.identity.cognitoIdentityId;
    const identity = {
        userId: userId,
        identityId: identityId
    }
    return response.createResponse(identity, 200);
};

export const findUserProfile = async (event) => {
    let userId = event.requestContext.identity.cognitoAuthenticationProvider.match(/CognitoSignIn:([^:]+)$/)[1];
    let params = {
        TableName: table,
        Key: {
            "userId": userId
        }
    };
    const userProfile = (!userId || false) ? {} : await database.get(params);
    return response.createResponse(userProfile, 200);
};

export const createOrUpdateUserProfile = async (event) => {
    const data = JSON.parse(event.body);
    let userId = event.requestContext.identity.cognitoAuthenticationProvider.match(/CognitoSignIn:([^:]+)$/)[1];
    let params = {
        TableName: table,
        Key: {
            "userId": userId
        }
    };
    const existingProfile = await database.get(params);
    let userProfile;
    if(!existingProfile) {
        userProfile = await createProfile(data, userId);
    } else {
        userProfile = await updateProfile(data, userId);
    }

    return response.createResponse(userProfile, 200);
}

const createProfile = async (data, userId) => {
    let params = {};
    /*params = {
        TableName: process.env['ENVIRONMENT'] + '.' + process.env['APP_NAME'] + '.' + process.env['SERVICE_NAME'] + '.' + 'sequence',
        Key: {
            "key": "user_seq"
        },
        UpdateExpression: "SET #sequence = #sequence + :inc",
        ExpressionAttributeNames: {
            "#sequence": "sequence"
        },
        ExpressionAttributeValues: { ":inc": 1 },
        ReturnValues: "ALL_NEW"
    }
    const sequenceDoc = await database.update(params);*/

    let communityList = [];
    params = {
        TableName: process.env['ENVIRONMENT'] + '.' + process.env['APP_NAME'] + '.' + process.env['SERVICE_NAME'] + '.' + 'community'
    }
    const allCommunities = await database.scan(params)
    allCommunities.sort((a, b) => (a.number > b.number) ? 1 : ((b.number > a.number) ? -1 : 0));
    for(let i in allCommunities) {
        let checked = false;
        if(data.hasOwnProperty('family') && data.family && data.family.hasOwnProperty('members') && allCommunities[i].name === 'Family') {
            checked = true;
        }
        communityList.push({"id": allCommunities[i].number, "name": allCommunities[i].name, "checked": false})
    }
    /*params = {
        TableName: process.env['ENVIRONMENT'] + '.' + process.env['APP_NAME'] + '.' + process.env['SERVICE_NAME'] + '.' + 'sequence',
        Key: {
            "key": "userRole_seq"
        },
        UpdateExpression: "SET #sequence = #sequence + :inc",
        ExpressionAttributeNames: {
            "#sequence": "sequence"
        },
        ExpressionAttributeValues: { ":inc": 1 },
        ReturnValues: "ALL_NEW"
    }
    const roleSequenceDoc = await database.update(params);*/
    params = {
        TableName: process.env['ENVIRONMENT'] + '.' + process.env['APP_NAME'] + '.' + process.env['SERVICE_NAME'] + '.' + 'role',
        Key: {
            "code": "USER",
        }
    };
    const defaultRole = await database.get(params);
    let familyRoles = [];
    if(data.hasOwnProperty('family') && data.family && data.family.hasOwnProperty('members')) {
        params = {
            TableName: process.env['ENVIRONMENT'] + '.' + process.env['APP_NAME'] + + '.' + process.env['SERVICE_NAME'] + '.' + 'role',
            ProjectionExpression: "#number, code, #name, #type",
            FilterExpression: '#type = :type',
            ExpressionAttributeNames: {
                '#number': 'number',
                '#name': 'name',
                '#type': 'type'
            },
            ExpressionAttributeValues: {
                ':type': 'Family'
            },
        };
        familyRoles = await database.scan(params);
    }
    const roles = [];
    roles.push(defaultRole);
    for(let i = 0; i< familyRoles.length; i++) {
        roles.push(familyRoles[i]);
    }
    /*const userRole = {
        TableName: process.env['ENVIRONMENT'] + '.' + process.env['APP_NAME'] + '.' + process.env['SERVICE_NAME'] + '.' + 'userRole',
        Item: {
            number: roleSequenceDoc.sequence,
            userNumber: sequenceDoc.sequence,
            roleList: [{
                id: defaultRole.number,
                name: defaultRole.name
            }]
        }
    }
    await database.put(userRole);*/
    const now = JSON.parse(JSON.stringify(new Date()));
    const profile = {
        TableName: data.hasOwnProperty('table') ? process.env['ENVIRONMENT'] + '.' + process.env['APP_NAME'] + '.' + process.env['SERVICE_NAME'] + '.' + data.table : table,
        Item: {
            "userId": data.userId,
            "identityId": data.identityId,
            "roles": roles,
            "firstName": data.firstName ? data.firstName : '',
            "lastName": data.lastName ? data.lastName : '',
            "dateOfBirth": data.dateOfBirth ? new Date(data.dateOfBirth) : '',
            "gender": data.gender ? data.gender : '',
            "email": data.email ? data.email : '',
            "address1": data.address1 ? data.address1 : '',
            "address2": data.address2 ? data.address2 : '',
            "city": data.city ? data.city : '',
            "postCode": data.postCode ? data.postCode : '',
            "countryCode": data.countryCode ? data.countryCode : '',
            "phone": data.phone ? data.phone : '',
            "about": data.about ? data.about : '',
            "communityList": data.communityList ? data.communityList : communityList,
            "mailingFlag": data.mailingFlag ? data.mailingFlag.toUpperCase() === 'TRUE' : true,
            "updatedAt": now,
            "lastLogin": now
        }
    }
    const doc = (!userId || false) ? {} : await database.put(profile);
    params = {
        TableName: data.hasOwnProperty('table') ? process.env['ENVIRONMENT'] + '.' + process.env['APP_NAME'] + '.' + process.env['SERVICE_NAME'] + '.' + data.table : table,
        Key: {
            "userId": data.userId
        }
    }
    return await database.get(params);
}

const updateProfile = async (data, userId) => {
    let update = [];
    let expAttrValues = {};
    let expAttrNames = {};
    let params = {};

    if(data.hasOwnProperty('identityId')) {
        update.push('identityId = :identityId');
        expAttrValues[":identityId"] = data.identityId
    }
    if(data.hasOwnProperty('lastName')) {
        update.push('lastName = :lastName');
        expAttrValues[":lastName"] = data.lastName;
    }
    if(data.hasOwnProperty('dateOfBirth')) {
        update.push('dateOfBirth = :dateOfBirth');
        expAttrValues[":dateOfBirth"] = data.dateOfBirth;
    }
    if(data.hasOwnProperty('gender')) {
        update.push('gender = :gender');
        expAttrValues[":gender"] = data.gender;
    }
    if(data.hasOwnProperty('address1')) {
        update.push('address1 = :address1');
        expAttrValues[":address1"] = data.address1;
    }
    if(data.hasOwnProperty('address2')) {
        update.push('address2 = :address2');
        expAttrValues[":address2"] = data.address2;
    }
    if(data.hasOwnProperty('city')) {
        update.push('city = :city');
        expAttrValues[":city"] = data.city;
    }
    if(data.hasOwnProperty('postCode')) {
        update.push('postCode = :postCode');
        expAttrValues[":postCode"] = data.postCode;
    }
    if(data.hasOwnProperty('countryCode')) {
        update.push('countryCode = :countryCode');
        expAttrValues[":countryCode"] = data.countryCode;
    }
    if(data.hasOwnProperty('phone')) {
        update.push('phone = :phone');
        expAttrValues[":phone"] = data.phone;
    }
    if(data.hasOwnProperty('about')) {
        update.push('about = :about');
        expAttrValues[":about"] = data.about;
    }
    if(data.hasOwnProperty('communityList')) {
        update.push('communityList = :communityList');
        expAttrValues[":communityList"] = data.communityList;
    } else {
        let communityList = [];
        params = {
            TableName: process.env['ENVIRONMENT'] + '.' + process.env['APP_NAME'] + '.' + process.env['SERVICE_NAME'] + '.' + 'community'
        }
        const allCommunities = await database.scan(params)
        allCommunities.sort((a, b) => (a.number > b.number) ? 1 : ((b.number > a.number) ? -1 : 0));
        for(let i in allCommunities) {
            let checked = false;
            if(data.hasOwnProperty('family') && data.family && data.family.hasOwnProperty('members') && allCommunities[i].name === 'Family') {
                checked = true;
            }
            communityList.push({"id": allCommunities[i].number, "name": allCommunities[i].name, "checked": checked});
        }
        update.push('communityList = :communityList');
        expAttrValues[":communityList"] = communityList;
    }
    if(data.hasOwnProperty('mailingFlag')) {
        update.push('mailingFlag = :mailingFlag');
        expAttrValues[":mailingFlag"] = data.mailingFlag;
    }
    if(data.hasOwnProperty('updatedAt') && !data.lastLogin) {
        update.push('updatedAt = :updatedAt');
        expAttrValues[":updatedAt"] = data.updatedAt;
    }
    if(data.hasOwnProperty('lastLogin')) {
        update.push('lastLogin = :lastLogin');
        expAttrValues[":lastLogin"] = data.lastLogin;
    }
    params = {
        TableName: table,
        Key: {
            "userId": userId
        },
    }
    const profile = await database.get(params);
    const currentRoles = profile.roles;
    let roles = [];
    for (let i = 0; i < currentRoles.length; i++) {
        roles.push(currentRoles[i]);
    }

    if(data.hasOwnProperty('family') && data.family && data.family.hasOwnProperty('members')) {
        params = {
            TableName: process.env['ENVIRONMENT'] + '.' + process.env['APP_NAME'] + '.' + process.env['SERVICE_NAME'] + '.' + 'role',
            ProjectionExpression: "#number, code, #name, #type",
            FilterExpression: '#type = :type',
            ExpressionAttributeNames: {
                '#number': 'number',
                '#name': 'name',
                '#type': 'type'
            },
            ExpressionAttributeValues: {
                ':type': 'Family'
            },
        };
        const familyRoles = await database.scan(params);
        for (let i = 0; i < familyRoles.length; i++) {
            let match = false;
            for(let j = 0; j < currentRoles.length; j++) {
                if(currentRoles[j].code === familyRoles[i].code) {
                    match = true;
                    break;
                }
            }
            if(!match) {
                roles.push(familyRoles[i]);
            }
        }
    }
    update.push('#roles = :roles');
    expAttrValues[":roles"] = roles;
    expAttrNames["#roles"] = 'roles';

    let updateExpr = '';
    for(let i = 0; i < update.length; i++) {
        if(i === 0) {
            updateExpr += 'SET ';
        } else {
            updateExpr += ', ';
        }
        updateExpr += update[i];
    }

    let conditionalExpr = 'userId = :userId'
    expAttrValues[':userId'] = data.userId;

    params = {
        TableName: table,
        Key: {
            "userId": userId
        },
        ConditionExpression: conditionalExpr,
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: expAttrNames,
        ExpressionAttributeValues: expAttrValues,
        ReturnValues: 'ALL_NEW'
    };
    return (!userId || false) ? {} : await database.update(params);
};
