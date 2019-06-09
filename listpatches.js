const fs = require('fs')
const path = require('path')
console.log('parsing the data...')
const escapedPathSep = path.sep.replace('\\', '\\\\')
// At the moment the program just reads the file list from a file that is generated with
// a system call (such as "dir *.syx /S /B" in windows), could be improved
const allSysexFiles = fs.readFileSync('allsyx.txt').toString().split(/[\r\n]+?/)
const sysexList = []
const directories = {}
allSysexFiles.forEach((fileName, idx) => {
	if (idx % 100 === 0) {
		console.log(`${idx} / ${allSysexFiles.length} processed`)
	}
	if (fileName === '' || fs.lstatSync(fileName).isDirectory()) return
	const buf = fs.readFileSync(fileName)
	if (buf[3] !== 9) return // Only DX7 supported atm
	let pos = 124
	for (let i = 1; i <= 32; i++) {
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
		const bank = fileName.replace(new RegExp('.+' + escapedPathSep), '').replace(/\..+?$/, '')
		sysexList.push({
			id: sysexList.length,
			dir: directories[relativeDir],
			// This data is accessed seldomly in UI so this is (somewhat) size-optimized
			data: [bank, i, patchName].join('/')
		})
		pos += 128
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
console.log('done!')