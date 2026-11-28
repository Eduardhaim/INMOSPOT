const { DataTypes } = require('sequelize')
const sequelize = require('../db/connection')

const Operacion = sequelize.define('Operacion', {

    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },

    solicitudId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: {
            model: 'solicitudes',
            key: 'id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'NO ACTION'
    },

    clienteId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'clientes',
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

    agenteId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'usuarios',
            key: 'id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'NO ACTION'
    },

    tipo: {
        type: DataTypes.ENUM('venta', 'alquiler'),
        allowNull: false
    },

    monto: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
            min: 0.01
        }
    },

    fecha: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },

    estado: {
        type: DataTypes.ENUM(
            'pendiente',
            'finalizada',
            'cancelada'
        ),
        allowNull: false,
        defaultValue: 'pendiente'
    }

}, {
    tableName: 'operaciones',
    timestamps: false
})

module.exports = Operacion