const WebSocket = require('ws');

// Timestapms
const moment = require('moment'); 

// Postgres
var pg_user = 'postgresuser'
var pg_host = '192.168.88.252'
var pg_database = 'plants_db'
var pg_password = 'password'
var pg_port = 5432

const initOptions = {
  // global event notification;
  error(error, e) {
      if (e.cn) {
          // A connection-related error;
          //
          // Connections are reported back with the password hashed,
          // for safe errors logging, without exposing passwords.
          console.log('CN:', e.cn);
          console.log('EVENT:', error.message || error);
      }
  }
};

const pgp = require('pg-promise')(initOptions);

// using an invalid connection string:
const db = pgp(`postgresql://${pg_user}:${pg_password}@${pg_host}:${pg_port}/${pg_database}`);



let connection; // global connection for permanent event listeners

function onNotification(data) {
  // console.log('Received Payload:', data.payload);
}

function setListeners(client) {
  client.on('notification', onNotification);
  return connection.none('LISTEN $1~', 'my-channel')
      .catch(error => {
          console.log(error); // unlikely to ever happen
      });
}

function removeListeners(client) {
  client.removeListener('notification', onNotification);
}

function onConnectionLost(err, e) {
  console.log('Connectivity Problem to postgres:', err);
  connection = null; // prevent use of the broken connection
  removeListeners(e.client);
  reconnect(5000, 10) // retry 10 times, with 5-second intervals
      .then(() => {
          console.log('Successfully Reconnected to postgres');
      })
      .catch(() => {
          // failed after 10 attempts
          console.log('Connection Lost Permanently to postgres');
          process.exit(); // exiting the process
      });
}

function reconnect(delay, maxAttempts) {
  delay = delay > 0 ? parseInt(delay) : 0;
  maxAttempts = maxAttempts > 0 ? parseInt(maxAttempts) : 1;
  console.log(`Attempting to reconnect to postgres: attempts left: ${maxAttempts}`)

  return new Promise((resolve, reject) => {
      setTimeout(() => {
          db.connect({direct: true, onLost: onConnectionLost})
              .then(obj => {
                  connection = obj; // global connection is now available
                  resolve(obj);
                  return setListeners(obj.client);
              })
              .catch(error => {
                  console.log('Error Connecting:', error);
                  if (--maxAttempts) {
                      reconnect(delay, maxAttempts)
                          .then(resolve)
                          .catch(reject);
                  } else {
                      reject(error);
                  }
              });
      }, delay);
  });
}

function sendNotifications() {
  // send a notification to our listener every second:
  setInterval(() => {
      if (connection) {
          connection.none('NOTIFY $1~, $2', ['my-channel', 'my payload string'])
              .catch(error => {
                  console.log('Failed to Notify:', error); // unlikely to ever happen
              })
      }
  }, 1000);
}

reconnect(5000, 10) // = same as reconnect(0, 1)
    .then(obj => {
        console.log('Successful Initial Connection to postgres');
        // obj.done(); - releases the connection
        sendNotifications();
    })
    .catch(error => {
        console.log('Failed Initial Connection:', error);
    });



// Websockets

const wss = new WebSocket.Server({ port: 7000 });
console.log('Staring ws...');

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    console.log(message)
    var m = JSON.parse(message)

    var mode = m['command']
    var data = m['data']

    if(mode === "message"){
      console.log(data)
      return
    }

    if(mode === "post"){   
      var analog = data['analog'] 
      var moisture = data['moisture']
      var plant_id = data['plant_id']

      const text = 'INSERT INTO soil(ts, analog, moisture, plant_id) VALUES($1, $2, $3, $4) RETURNING *'
      const values = [moment().unix(), analog, moisture, plant_id]

      // promise
      db.one(text, values)
      .then(res => {
        console.log(res.rows[0])
      })
      .catch(e => console.error(e.stack))
    }
    
  });

  

  ws.send('something');
});
