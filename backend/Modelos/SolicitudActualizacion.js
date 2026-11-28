const { DataTypes } = require('sequelize')
const sequelize = require('../db/connection')

const SolicitudActualizacion = sequelize.define(
    'SolicitudActualizacion',
    {
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
                'atendida',
                'rechazada'
            ),
            allowNull: false,
            defaultValue: 'pendiente'
        },

        respuesta: {
            type: DataTypes.TEXT,
            allowNull: true
        },

        agenteId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'usuarios',
                key: 'id'
            },
            onDelete: 'RESTRICT',
            onUpdate: 'NO ACTION'
        },

        fechaRespuesta: {
            type: DataTypes.DATE,
            allowNull: true
        }
    },
    {
        tableName: 'solicitudes_actualizacion',
        timestamps: false
    }
)

module.exports = SolicitudActualizacion