
const { DataTypes } = require('sequelize')
const sequelize = require('../db/connection')

const Solicitud = sequelize.define('Solicitud', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    usuarioId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'usuarios',
            key: 'id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'NO ACTION'
    },
    propiedadId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'propiedades',
            key: 'id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'NO ACTION'
    },
    mensaje: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    fecha: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    estado: {
        type: DataTypes.ENUM(
            'pendiente',
            'aceptada',
            'rechazada',
            'cancelada'
        ),
        allowNull: false,
        defaultValue: 'pendiente'
    }
}, {
    tableName: 'solicitudes',
    timestamps: false
})

module.exports = Solicitud
