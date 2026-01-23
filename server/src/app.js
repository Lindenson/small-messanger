const express = require("express");
const app = express();

app.use(express.json());

app.use(require("./messages/messageRoutes"));
app.use(require("./contacts/contactsRoutes"));

module.exports = app;
