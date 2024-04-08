const hubspot = require('@hubspot/api-client');
const {get, post} = require("axios");

exports.main = async (context = {}) => {

    const {hs_object_id} = context.propertiesToSend;

    if (context.parameters) {
        if (context.parameters.target === 'amanda_convert_deal') {
            const amandaData = await convertDealInAmanda(hs_object_id);
            const updatedDeal = await updateDeal(hs_object_id, amandaData);
            return {amandaData, updatedDeal};
        }
        if (context.parameters.target === 'amanda_update_task') {
            const taskUpdated = await updateTask(context.parameters.taskToUpdate);
            return {taskUpdated};
        }
        const userId = context.parameters.user.id;
        const deal = await getAssociatedDeals(hs_object_id);
        const tasks = await getTasks(deal);
        const owner = await getOwner(deal);
        const userData = await getUserData(userId);

        return {deal, tasks, owner, userData};

    } else {
        return {}
    }
};

async function getAssociatedDeals(hs_object_id) {
    const hubSpotClient = new hubspot.Client({
        accessToken: process.env['PRIVATE_APP_ACCESS_TOKEN'],
    });
    const deal = await hubSpotClient.crm.deals.basicApi.getById(hs_object_id, ['dealname', 'dealstage', 'hubspot_owner_id'], null, ['tasks','contacts']);

    return deal;
}

async function getTasks(deal) {
    const hubSpotClient = new hubspot.Client({
        accessToken: process.env['PRIVATE_APP_ACCESS_TOKEN'],
    });

    const tasks = [];
    if (deal.associations && deal.associations.tasks) {
        for (const taskId of deal.associations.tasks.results.map((deal) => deal.id)) {

            const task = await hubSpotClient.crm.objects.tasks.basicApi.getById(taskId, ['hs_task_body', 'hs_task_subject', 'hs_task_status']);

            tasks.push(task);
        }
    }

    return tasks
}

async function updateTask(taskToUpdate) {
    const hubSpotClient = new hubspot.Client({
        accessToken: process.env['PRIVATE_APP_ACCESS_TOKEN'],
    });

    const properties = {
            "hs_task_status": "COMPLETED",
    }

    const task = await hubSpotClient.crm.objects.tasks.basicApi.update(taskToUpdate.id, {'properties':properties});

    return task
}

async function updateDeal(dealId, amandaData) {
    const hubSpotClient = new hubspot.Client({
        accessToken: process.env['PRIVATE_APP_ACCESS_TOKEN'],
    });

    const hasErrors = amandaData && amandaData instanceof Array && amandaData[0] === 'Error';

    if(amandaData && !hasErrors) {
        const properties = {
            'etat_conversion':`Conversion faite le : ${new Date().toLocaleDateString("fr-FR").toLocaleUpperCase()}`
        }

        const updatedDeal = await hubSpotClient.crm.deals.basicApi.update(dealId, {'properties':properties})

        return  updatedDeal;
    }

    return null
}

async function getOwner(deal) {
    const hubSpotClient = new hubspot.Client({
        accessToken: process.env['PRIVATE_APP_ACCESS_TOKEN'],
    });

    const ownerId = deal.properties.hubspot_owner_id;
    const idProperty = "id";
    const archived = false;

    let owner = null;

    try {
        owner = await hubSpotClient.crm.owners.ownersApi.getById(ownerId, idProperty, archived);
    } catch (e) {
        e.message === 'HTTP request failed' ? console.error(JSON.stringify(e.response, null, 2)) : console.error(e)
    }
    return owner
}

async function getUserData(userID) {

    const hubspotClient = new hubspot.Client({"accessToken": process.env['PRIVATE_APP_ACCESS_TOKEN']});

    try {
        const user = await hubspotClient.settings.users.usersApi.getById(userID);
        //const users = await hubspotClient.settings.users.usersApi.getPage();

        return user
    } catch (e) {
        e.message === 'HTTP request failed' ? console.error(JSON.stringify(e.response, null, 2)) : console.error(e)
    }

    return 'User not found'
}

async function convertDealInAmanda(hs_object_id) {

    const res = await post('https://dev3-api.tenergie.fr/v2/hubspot/convert', {'hubspot_id':hs_object_id},{
        headers: {
            'accept': '*/*', 'X-Authorization': 'bcd6D306-e24t-1235-tv68-6b9c-5904'
        },
    }).then(response => {
        return response.data;
    }).catch((error)=>{
        const errorArray = error.response.data.message;
        errorArray.unshift('Error');
        return errorArray
    })

    return res

    return {}
}