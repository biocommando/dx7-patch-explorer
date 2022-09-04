const fs = require('fs')
const path = require('path')
console.log('parsing the data...')
const escapedPathSep = path.sep.replace('\\', '\\\\')
const allSysexFiles = fs.readFileSync('allsyx.txt').toString().split(/[\r\n]+?/)
const sysexList = []
const directories = {}
const duplicateCheckMetadata = []
const duplicateFileCheckMetadata = []

const compareBufferSlices = (buf1, pos1, buf2, pos2) => {
	for (let i = 0; i < 128; i++) {
		if (buf1[pos1 + i] !== buf2[pos2 + i]) {
			return false;
		}
	}
	return true;
}

const comparePatches = (file1, patchnum1, file2, patchnum2) => {
	const buf1 = fs.readFileSync(file1)
	const buf2 = fs.readFileSync(file2)
	const pos1 = 124 + patchnum1 * 128
	const pos2 = 124 + patchnum1 * 128
	return compareBufferSlices(buf1, pos1, buf2, pos2)
}

const compareBanks = (file1, file2) => {
	const buf1 = fs.readFileSync(file1)
	const buf2 = fs.readFileSync(file2)
	
	if (buf1.length !== buf2.length) return false
		
	for (let i = 0; i < buf1.length; i++) {
		if (buf1[i] !== buf2[i]) {
			return false;
		}
	}
	return true;
}

let duplicateCount = 0, duplicateFileCount = 0

allSysexFiles.forEach((fileName, idx) => {
	console.log(`${idx} / ${allSysexFiles.length} processed`)
	if (fileName === '' || fs.lstatSync(fileName).isDirectory()) return
	const bank = fileName.replace(new RegExp('.+' + escapedPathSep), '').replace(/\..+?$/, '')
	
	if (duplicateFileCheckMetadata.some(x => x.bank === bank.toLocaleUpperCase())) {
		if (duplicateFileCheckMetadata.filter(x => x.bank === bank.toLocaleUpperCase()).some(x => compareBanks(fileName, x.fileName))) {
			duplicateFileCount++
			return
		}
	}
	duplicateFileCheckMetadata.push({bank: bank.toLocaleUpperCase(), fileName})
	
	const buf = fs.readFileSync(fileName)
	if (buf[3] !== 9) return // Only DX7 supported atm
	let pos = 124 - 128
	for (let i = 1; i <= 32; i++) {
		pos += 128
		let patchName = ''
		let chrsum = 0
		for (let patchNameChr = 0; patchNameChr < 10; patchNameChr++) {
			const patchNameChrPos = pos + patchNameChr
			const numVal = buf[patchNameChrPos]
			patchName += String.fromCharCode(numVal)
			chrsum += numVal
		}
		// I'm not sure what indicates that the patch dump ends but apparently in some dumps the rest of
		// the patches are just zeroes in that case so let's use this simplified approach then...
		if (chrsum === 0) continue;
		let relativeDir = fileName.replace(process.cwd(), '').split(path.sep).filter(x => x !== '')
		relativeDir.pop()
		relativeDir = relativeDir.join(path.sep)
		if (directories[relativeDir] === undefined) {
			directories[relativeDir] = idx
		}
		patchName = patchName.replace(/[^a-zA-Z0-9.,_ /-]/g, '?').trim()
		// There are many duplicate banks and patches there, so let's just check that no duplicate patches are put to the output
		const possibleDuplicates = duplicateCheckMetadata.filter(x => x.patchName === patchName)
		if (possibleDuplicates.length > 0) {
			const areEqual = possibleDuplicates.some(possibleDuplicate => comparePatches(fileName, i - 1, possibleDuplicate.fileName, possibleDuplicate.patchNum))
			if (areEqual) {
				duplicateCount++
				continue
			}
		}
		duplicateCheckMetadata.push({ patchName, fileName, patchNum: i - 1 })
		
		sysexList.push({
			id: sysexList.length,
			dir: directories[relativeDir],
			// This data is accessed seldomly in UI so this is (somewhat) size-optimized
			data: [bank, i, patchName].join('/')
		})
	}
})


// The object contains list of patches and a list of all directories mapped to an id.
// Each patch object contains only an id of the directory instead of the directory as a string.
// Also, the full path of the file is reconstructed in the UI.
// For large patch libraries these optimizations will reduce the size of the output file drastically
// (120 MB to 27 MB in one of my libraries) and make the output web page load much quicker.
const fileContents = {
	sysexList,
	directories
}

console.log('writing files...')
const html = fs.readFileSync('template.html')
	.toString()
	// The data is injected into a javascript string so we need to escape some characters
	.replace('@@working-dir@@', process.cwd().replace(/\\/g, '\\\\'))
	.replace('@@pathSep@@', path.sep === '\\' ? 'windows' : 'unix')
	.replace('@@JSON@@', JSON.stringify(fileContents)
		.replace(/\\/g, '\\\\')
		.replace(/'/g, '\\\''))
fs.writeFileSync('patch-explorer.html', html)
if (duplicateFileCount > 0) console.log('Excluded ' + duplicateFileCount + ' duplicate banks')
if (duplicateCount > 0) console.log('Excluded ' + duplicateCount + ' duplicate patches')
console.log('done!')
