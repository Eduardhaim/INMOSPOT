
const { DataTypes } = require('sequelize')
const sequelize = require('../db/connection')

const Fotografia = sequelize.define('Fotografia', {

    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },

    url: {
        type: DataTypes.STRING
    },

    propiedadId: {
        type: DataTypes.INTEGER
    }

}, {
    tableName: 'fotografias',
    timestamps: false
})

module.exports = Fotografia;
