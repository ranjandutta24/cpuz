const winston = require("winston");
const mongoose = require("mongoose");
const Grid = require("gridfs-stream");
const multer = require("multer");
const path = require("path");

module.exports = function () {
  mongoose
    .connect("mongodb://127.0.0.1:27017/cpu_status")
    // .connect("mongodb://192.168.31.87:27017/cpu_status", {
    //   useNewUrlParser: true,
    //   useCreateIndex: true,
    //   useUnifiedTopology: true,
    //   useFindAndModify: false,
    // })

    .then(() => winston.info("Connected To MongoDB..."));
};

// .connect(DB, {
//   useNewUrlParser: true,
//   useCreateIndex: true,
//   useUnifiedTopology: true,
//   useFindAndModify: false,
// })
