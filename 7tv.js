const sfetch = require('sync-fetch');
module.exports = { yeahbut7tv, yeahbut7tvGlobal }

function yeahbut7tv(channel) {
	if(channel[0] == "#") {
		channel = channel.substring(1);
	}
	let queryStr = `{
		user(id: "${channel}") {
			emotes {
				id
				name
				provider
				provider_id
				visibility
				mime
				owner {
					id
					display_name
					login
					twitch_id
				}
			}
		}
	}`
	let params = new URLSearchParams();
	params.append('query', queryStr);

	let apiUrl = 'https://api.7tv.app/v2/gql';

	const res = sfetch(apiUrl, {
		method : 'POST',
		body :  params
	})
	console.log("http code : " + res.status)
	const data = res.text();
	console.log(data);
	return data;
}


function yeahbut7tvGlobal(page) {
	let queryStr = `{
		search_emotes(query: "", globalState: "only", limit: 10, page: ${page}, pageSize: 10) {
			id
			name

		}
	}`
    /*
    			provider
			provider_id
			visibility
			mime
			owner {
				id
				display_name
				login
				twitch_id
			}
            */
    // queryStr = "{search_emotes(query: \"\",limit: 0,page: 5,pageSize: 0, globalState: \"only\", sortBy: \"popularity\", sortOrder: 0) {id,visibility,owner {id,display_name,role {id,name,color},banned}name}}"
	let params = new URLSearchParams();
	params.append('query', queryStr);

	let apiUrl = 'https://api.7tv.app/v2/gql';

	const data = sfetch(apiUrl, {
		method : 'POST',
		body :  params
	}).text();
	// console.log(data);
	return data;
}


for(i = 1; i < 10; i++) {
    console.log("page " + i);
    let res = yeahbut7tvGlobal(i);
    let data = JSON.parse(res);
    console.log(JSON.stringify(data, null, 2));
    console.log(data.data.search_emotes.length)
}

