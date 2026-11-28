const { DataTypes } = require('sequelize')
const sequelize = require('../db/connection')

const Contrato = sequelize.define('Contrato', {

    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },

    operacionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: {
            model: 'operaciones',
            key: 'id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'NO ACTION'
    },

    fechaInicio: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },

    fechaFin: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },

    condiciones: {
        type: DataTypes.TEXT,
        allowNull: false
    },

    fechaRegistro: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },

    estado: {
        type: DataTypes.ENUM(
            'vigente',
            'finalizado'
        ),
        allowNull: false,
        defaultValue: 'vigente'
    }

}, {
    tableName: 'contratos',
    timestamps: false
})

module.exports = Contrato