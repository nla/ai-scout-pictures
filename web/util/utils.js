const fs = require('fs') ;
const path = require('path') ;
const moment = require('moment') ;
const log = require('log4js').getLogger('util') ;
const axios = require('axios') ;
const url = require("url") ;

let appConfig = null ;
        


/*
async function fileExistsAsync(filePath) {

	return new Promise(function (resolve, reject) {
		fs.access(filePath, fs.constants.F_OK, function (error) {
			if (error) resolve(false) ;
			else resolve(true) ;				  
		}) ;
	}) ;
}

async function openFile(filePath, flags) {

	return new Promise(function (resolve, reject) {
		fs.open(filePath, flags, function (error, fd) {
			if (error) reject("error opening file " + filePath + " with flags " + flags + " :" + error) ;
			else resolve(fd) ;				  
		}) ;
	}) ;
}

async function closeFile(fd) {

	return new Promise(function (resolve, reject) {
		fs.close(fd, function (error) {
			if (error) reject("error closing fd " + fd + " :" + error) ;
			else resolve(true) ;				  
		}) ;
	}) ;
}

async function readBufferFromFile(fd, buffer, offset, length, position) {

	return new Promise(function (resolve, reject) {
		fs.read(fd, buffer, offset, length, position, function (error, bytesRead) {
			if (error) reject("error reading fd " + fd + " offset " + offset + " length " + length + " position " + position + " :" + error) ;
			else resolve(bytesRead) ;				  
		}) ;
	}) ;
}

async function appendBufferToFile(fd, buffer, offset, length) {

	return new Promise(function (resolve, reject) {
		fs.write(fd, buffer, offset, length, function (error, bytesWritten) {
			if (error) reject("error writing fd " + fd + " offset " + offset + " length " + length +  " :" + error) ;
			else resolve(bytesWritten) ;				  
		}) ;
	}) ;
}
*/
		
module.exports = {

	init: function(appConfigParm) {

		appConfig = appConfigParm ;

   
	},
		
/*
	//  ----- fs -----
	
	fileUnlinkAsync: async function fileUnlinkAsync(filePath) {

		return new Promise(function (resolve, reject) {
			fs.unlink(filePath, function (error) {
				if (error) reject(error) ;
				else resolve(true) ;				  
			}) ;
		}) ;
	},
		
	fileStatAsync: async function fileStatAsync(filePath) {

		return new Promise(function (resolve, reject) {
			fs.stat(filePath, function (error, result) {
				if (error) reject(error) ;
				else resolve(result) ;				  
			}) ;
		}) ;
	},
	
	readDirAsync: async function readDirAsync(dirPath) {

		return new Promise(function (resolve, reject) {
			fs.readdir(dirPath, function (error, result) {
				if (error) reject(error) ;
				else resolve(result) ;				  
			}) ;
		}) ;
	},	

	fileExistsAsync: async function fileExistsAsync(filePath) {

		return new Promise(function (resolve, reject) {
			fs.access(filePath, fs.constants.F_OK, function (error) {
				if (error) resolve(false) ;
				else resolve(true) ;				  
			}) ;
		}) ;
	},

	writeUTF8FileAsync: async function(filePath, data) {

		return new Promise(function (resolve, reject) {
			fs.writeFile(filePath, data, function (error, result) {
				if (error) reject(error) ;
				else resolve(result) ;				  
			}) ;
		}) ;
	},

	readUTF8FileAsync: async function(filePath) {

		return new Promise(function (resolve, reject) {
			fs.readFile(filePath, 'utf8', function (error, data) {
				if (error) reject(error) ;
				else resolve(data) ;				  
			}) ;
		}) ;
	},	

	readFileIntoBufferAsync: async function(filePath) {

		return new Promise(function (resolve, reject) {
			fs.readFile(filePath, function (error, data) {
				if (error) reject(error) ;
				else resolve(data) ;				  
			}) ;
		}) ;
	},	

	fileRenameAsync: async function fileRenameAsync(oldFilePath, newFilePath) {

		return new Promise(function (resolve, reject) {
			fs.rename(oldFilePath, newFilePath, function (error) {
				if (error) reject(error) ;
				else resolve(true) ;				  
			}) ;
		}) ;
	},
*/

	getJSONResponseAsync: async function (url, useProxy) {	// useProxy defaults to true!

		if (typeof useProxy === 'undefined') useProxy = false ;
		log.debug("getJSONResponseAsync url:" + url + "  useProxy:" + useProxy) ;
		let resp = await axios({
			method: 'get',
			url: url,
			proxy: useProxy		// generally, we dont want axios to use a proxy...
		}) ;

		log.debug("getJSONResponseAsync url:" + url + "  status:" + resp.status) ;

		return resp.data ;
	},


	//  ----- date/time -----

	formatRawTimestamp: function(timestamp) {

		if (!timestamp) return "-NONE-" ;
		const d = new Date() ;
		d.setTime(timestamp) 
		return "" + d ;
	},

	formatAsSqlTimestamp: function(timestamp) {

		if (!timestamp) return null ;
		return moment(timestamp).format('YYYY-MM-DD HH:mm:ss') ;
	},

	currentTimestampAsYYYYMMDDHHmmSS: function() {

		return moment().format('YYYYMMDD-HHmmss') ;
	},

	currentTimestampAsYYYYMMDDHHmmSSSSS: function() {	// millisec accuracy

		return moment().format('YYYYMMDD-HHmmssSSS') ;
	},

	//	----- misc -----


	getIP: function(req) {
		if (!req) return null ;
		// normally, return penultimate as we are behind 2 proxies?
		const proxiedFor = req.headers['x-forwarded-for'] ;
		if (proxiedFor) {
			const proxiedForArray = proxiedFor.split(',') ;
			if (proxiedForArray.length > 1) return proxiedForArray[proxiedForArray.length - 2] ;
			if (proxiedForArray.length > 0) return proxiedForArray[0] ;
		}
		return req.connection.remoteAddress ||  req.socket.remoteAddress || req.connection.socket.remoteAddress ;
	},
	
	sleep: async function(ms) {

		return new Promise(resolve => setTimeout(resolve, ms)) ;
	},

	jsonEscape: function(str) {
		return str
				.replace(/[\\]/g, '\\\\')
				.replace(/[\"]/g, '\\\"')
				.replace(/[\/]/g, '\\/')
				.replace(/[\b]/g, '\\b')
				.replace(/[\f]/g, '\\f')
				.replace(/[\n]/g, '\\n')
				.replace(/[\r]/g, '\\r')
				.replace(/[\t]/g, '\\t') ;
	},


	innerProduct: function (v1, v2) {

		let r = 0 ;
		for (let i=0;i<v1.length;i++) r +=  v1[i] * v2[i] ;
		
		return r ;
	},

	getEmbedding: async function(str) {

		const queryParams = {
			text: str
		} ;
		const params = new url.URLSearchParams(queryParams);

		console.log("get embedding url " + appConfig.textEmbeddingURL + "?" + params) ;
		let eRes = await axios.get(appConfig.textEmbeddingURL + "?" + params) ; 
	
		if (!eRes.status == 200) throw "Cant get embedding, embedding server returned http resp " + eRes.status ;
		if (!eRes.data) throw "Cant get embedding, embedding server returned no data" ;
		console.log("returned data: " + JSON.stringify(eRes.data).substring(0, 50) + "...") ;
		return eRes.data ; // [x, y, ...]
	}

} ;