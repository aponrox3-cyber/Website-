var wget = require('../wget');

// Each download can run a headless browser or wget for a long time, so the
// number running at once is capped. Raise it with MAX_CONCURRENT_JOBS.
var MAX_JOBS = Math.max(1, Number(process.env.MAX_CONCURRENT_JOBS) || 5);
var running = 0;

module.exports = (io) => {
  io.on('connection', function (socket) {
    socket.on('request', function (data) {
      // The token is used as an event name. Restricting it to plain
      // alphanumerics keeps clients from naming reserved events such as
      // "disconnect" or "error", which make socket.emit throw and crash the
      // server.
      if (!data || typeof data.token !== 'string' || !/^[A-Za-z0-9]{16,64}$/.test(data.token)) return;

      // The handle returned by wget() is now stored on the socket. It never was
      // before, so the cleanup below could never find a process to stop.
      if (socket.job) {
        socket.emit(data.token, { error: 'A download is already running on this connection.' });
        return;
      }

      if (running >= MAX_JOBS) {
        socket.emit(data.token, { error: 'The server is busy with other downloads. Please try again in a few minutes.' });
        return;
      }

      console.log('Request connection received %s', data.token);
      running++;
      var released = false;
      socket.job = wget(socket, data, function () {
        if (!released) { released = true; running--; }
        socket.job = null;
      });
    });

    socket.on('disconnect', function () {
      console.log('User disconnected');
      // Stop the wget process and remove partially downloaded files
      if (socket.job) {
        socket.job.cancel();
        socket.job = null;
      }
    });
  });
};
