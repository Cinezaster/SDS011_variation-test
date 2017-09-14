/*eslint no-undef: "error"*/
/*eslint-env node*/
const calculateChecksum = (buffer) => {

    let sum = 0
    for (var i = 16; i >= 2; i--) {
        sum += buffer[i]
    }
    return sum % 256
}

const validateCheckSum = (buffer) => {
    let sum = 0
    for (var i = 7; i >= 2; i--) {
        sum += buffer[i]
    }
    return (sum % 256 === buffer[8])? true:false
}

const generateCommand = (type, id = Buffer.from('FFFF', 'hex'), period = 0) => {

    const command = Buffer.from('AAB400000000000000000000000000000000AB', 'hex')

    command[15] = id[0]
    command[16] = id[1]

    switch (type) {
    case 'queryData':
        command[2] = 0x04
        break
    case 'getMode':
        command[2] = 0x02
        break
    case 'setQueryMode':
        command[2] = 0x02
        command[3] = 0x01
        break
    case 'setReportingMode':
        command[2] = 0x02
        command[3] = 0x01
        command[4] = 0x01
        break
    case 'getState':
        command[2] = 0x06
        break
    case 'sleep':
        command[2] = 0x06
        command[3] = 0x01
        break
    case 'wakeUp':
        command[2] = 0x06
        command[3] = 0x01
        command[4] = 0x01
        break
    case 'setReportingPeriode':
        command[2] = 0x08
        command[3] = 0x01
        command[4] = Math.min(Math.max(parseInt(period), 0), 30).toString(16)
        break
    case 'checkFirmware':
        command[2] = 0x07
        break
    }
    return calculateChecksum(command)
}
exports.generateCommand = generateCommand
exports.calculateChecksum = calculateChecksum
exports.validateCheckSum = validateCheckSum

exports.decodeData = (data) => {

    if (!validateCheckSum(data)) {
        return {
            error: 'checksum is not valid'
        }
    }

    switch (data[1]) {
    case 0xC0:
        // Query Data Reply
        return {
            PM25 : ((data[3]*256)+data[2])/10,
            PM10 :((data[5]*256)+data[4])/10,
            id : data[6].toString(16).toUpperCase()+data[7].toString(16).toUpperCase(),
            time : Date.now() / 1000 | 0
        }
    case 0xC5:
        // Settings Reply
        switch (data[2]) {
        case 0x02:
            // Mode response
            return {
                id : data[6].toString(16).toUpperCase()+data[7].toString(16).toUpperCase(),
                mode : !data[4]? 'active':'query'
            }
        case 0x05:
            // ID response
            return {
                id : data[6].toString(16).toUpperCase()+data[7].toString(16).toUpperCase(),
            }
        case 0x08:
            // Periode response
            return {
                id : data[6].toString(16).toUpperCase()+data[7].toString(16).toUpperCase(),
                mode : !data[4]? 'sleep':'work'
            }
        case 0x07:
            // Firmware response
            return {
                id : data[6].toString(16).toUpperCase()+data[7].toString(16).toUpperCase(),
                firmware : data[5].toString(16).toUpperCase()+'/'+data[4].toString(16).toUpperCase()+'/'+data[3].toString(16).toUpperCase()
            }
        }
    }
    return {
        error: 'Unknown data message'
    }
}
