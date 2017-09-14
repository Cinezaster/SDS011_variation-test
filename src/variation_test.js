/*eslint no-undef: "error"*/
/*eslint-env node*/

const SerialPort = require('serialport')
const fs = require('fs')
const SDSO11 = require('./sds011.js')

// Config file
const config = {
    measurementIntervalInSeconds : 60,
    debug : 1,
    sensorTimeoutMillis : 400 // This is deterministally defined when set to 200 we miss our response sometimes
}

// Empty array for adding connected serial ports to
const serialPortsArray = []

// List of all sensors we need to read
// Sensor Id's are writen no the sensor itself under the barcode
// example: 5001-15D5 take 15D5 and transform it into 0x15 and 0xD5
const sensors = [
    {
        id : [0x15,0xD5]
    },{
        id : [0x15,0xD4]
    },{
        id : [0x15,0xE4]
    },{
        id : [0x15,0xCD]
    },{
        id : [0x17,0x68]
    },{
        id : [0x17,0x91]
    },{
        id : [0x17,0x3D]
    },{
        id : [0x17,0x93]
    },{
        id : [0x15,0xD3]
    },{
        id : [0x15,0xD7]
    },{
        id : [0x15,0xDE]
    },{
        id : [0x15,0xDB]
    },{
        id : [0x15,0xE0]
    },{
        id : [0x15,0xD1]
    },{
        id : [0x15,0xE1]
    }
]

// Get date of today in YYYY-MM-DD format
const today = new Date().toJSON().slice(0,10)
// create a path for the csv file, to write to
const csvPath = __dirname + '/data_'+today+'.csv'

// Promise function to get the data from a certain sensor connected to a defined port
const getSensorData = (port, sensorID) => {

    // SDS011 QueryDataCommand
    const queryDataCommand = Buffer.from('AAB404000000000000000000000000FFFF00AB', 'hex')
    // Set sensorID in the QueryDataCommand
    queryDataCommand[15] = sensorID[0]
    queryDataCommand[16] = sensorID[1]
    // Calculate the Checksum so this QueryDataCommand is valid and accepted by the sensor
    queryDataCommand[17] = SDSO11.calculateChecksum(queryDataCommand)

    // return a new Promise
    return new Promise((resolve, reject) => {

        // Write our queryDataCommand to the port
        port.write(queryDataCommand, (error) => {
            if (error) {
                debugLogger(1,error)
            }
        })

        // Create timeout function, so we don't wait forever when Sensor does not return data
        let timeout = setTimeout(() => {
            clearTimeout(timeout)
            reject('Timed out in '+ config.sensorTimeoutMillis + 'ms.')
        }, config.sensorTimeoutMillis)

        port.once('data', onData)

        port.once('error', onError)

        function onError(err) {
            //port.removeListener('data',onData)
            reject(err)
        }

        function onData(data) {
            //port.removeListener('error',onError)
            clearTimeout(timeout)
            if (data.length == 10 && SDSO11.validateCheckSum(data)) {
                const convertedData = SDSO11.decodeData(data)
                resolve(convertedData)
            }
        }
    })
}

const connecting = () => {
    debugLogger(1,'start connecting sensors to a Serial port')

    let portsConnected = 0

    serialPortsArray.forEach((port) => {

        let sensorNr = 0

        const sensorsEach = (sensor) => {

            if (!sensor) {
                portsConnected++
                if (portsConnected === serialPortsArray.length) startMeasuring()
                return
            }
            sensorNr++

            if (sensor.connected) return sensorsEach(sensors[sensorNr])

            getSensorData(port,sensor.id).then(() => {
                debugLogger(2, 'sensor '+ sensor.id[0].toString(16).toUpperCase()+sensor.id[1].toString(16).toUpperCase() + ' has been found on port ' + port.path)

                sensor.connected = true

                port.sensors.push(sensor)

                sensorsEach(sensors[sensorNr])
            }).catch((rej) => {
                debugLogger(2, rej)

                sensorsEach(sensors[sensorNr])
            })
        }
        sensorsEach(sensors[sensorNr])
    })
}

const startMeasuring = () => {
    debugLogger(1,' startMeasuring')
    measureAllSensors()
    setInterval(measureAllSensors, config.measurementIntervalInSeconds * 1000)
}

// Function that retreives data for all the sensors
const measureAllSensors = () => {

    // variable to count all successful responses from the sensors
    let counter = 0

    // loop over all our Serialports
    serialPortsArray.forEach((port) => {

        let sensorNr = 0

        const measureSensor = (sensor) => {
            // When we measured all sensors
            if (counter === sensors.length) debugLogger(1, 'All sensors replied')
            // if sensor is undefined quite and finnish this loop
            if (!sensor) return

            sensorNr++

            // Get data via the getSensorData function which returns a Promise
            getSensorData(port,sensor.id).then((data) => {
                // when our promise is resolved

                debugLogger(2, 'Received :' + JSON.stringify(data)+ ' from ' + data.id + ' on port' + port.path)

                // append our data to our csv file
                fs.appendFileSync(csvPath, data.id +', ' + data.PM25 +', ' + data.PM10 +', ' + data.time + '\n')

                // add one to our counter
                counter++

                // measure the next sensor for this port
                measureSensor(port.sensors[sensorNr])

            }).catch((rej)=>{
                // when our promise is rejected
                debugLogger(0, rej)

                // measure the next sensor for this port
                measureSensor(port.sensors[sensorNr])
            })
        }

        // measure
        measureSensor(port.sensors[sensorNr])
    })
}

// Function to log messages to the console.
// Since printing to much messages can generate an overflow on the stdout
const debugLogger = (level, message) => {
    if (level <= config.debug) {
        process.stdout.write(message + '\n')
    }
}

// START Program

// check if file exists if not create and add CSV headers
if (!fs.existsSync(csvPath)) {
    debugLogger(1,'csv file does not exist for today')
    fs.writeFile(csvPath, 'ID, PM25, PM10, TIME\n', function (err) {
        if (err) throw err
        debugLogger(1,'csv file created')
    })
} else {
    debugLogger(1,'csv file exist for today, measuerments will be added')
}

//Make connection to all ports
SerialPort.list(function (err, portList) {

    // serialPort list and only keep our wchusbSerial Devices
    const filteredPortList = portList.filter((port)=>{
        return port.comName.indexOf('wchusbseria') !== -1
    })

    // Loop over every portName and connect to it
    filteredPortList.forEach(function(port) {

        // Connect to all the serial ports
        const myPort = new SerialPort(port.comName)

        // Add event open for when the port is opened
        myPort.on('open', () => {
            debugLogger(1, port.comName + ' open')

            // Create an Array to add our sensors to for later
            myPort.sensors = []

            // While searching for sensors connected to which port, we could get a message complaining
            // That we exceed the limit of event listners
            myPort.setMaxListeners(0)

            // Add port to our list of serialPorts
            serialPortsArray.push(myPort)

            // IF all ports are created, bind sensors to the correct port
            if (serialPortsArray.length === filteredPortList.length) connecting()
        })
    })
})
