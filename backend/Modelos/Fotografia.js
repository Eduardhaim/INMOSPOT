
const { DataTypes } = require('sequelize')
const sequelize = require('../db/connection')

const Fotografia = sequelize.define('Fotografia', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    url: {
        type: DataTypes.STRING,
        allowNull: false
    },
    propiedadId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'propiedades',
            key: 'id'
        },
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION'
    }
}, {
    tableName: 'fotografias',
    timestamps: false
})

module.exports = Fotografia
