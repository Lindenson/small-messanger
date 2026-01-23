const axios = require("axios");
const KRATOS_ADMIN = "http://kratos:4434/admin";

exports.getIdentity = (id) =>
    axios.get(`${KRATOS_ADMIN}/identities/${id}`).then(r => r.data);

exports.getAllIdentities = () =>
    axios.get(`${KRATOS_ADMIN}/identities`).then(r => r.data);
