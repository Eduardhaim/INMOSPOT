const { DataTypes } = require('sequelize')
const sequelize = require('../db/connection')

const Pago = sequelize.define('Pago', {

    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },

    contratoId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'contratos',
            key: 'id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'NO ACTION'
    },

    monto: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
            min: 0.01
        }
    },

    fechaVencimiento: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },

    fechaPago: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },

    metodoPago: {
        type: DataTypes.ENUM(
            'efectivo',
            'transferencia',
            'tarjeta',
            'cheque'
        ),
        allowNull: true
    },

    observacion: {
        type: DataTypes.TEXT,
        allowNull: true
    }

}, {
    tableName: 'pagos',
    timestamps: false,
    indexes: [
        {
            unique: true,
            fields: ['contratoId', 'fechaVencimiento']
        }
    ]
})

module.exports = Pago