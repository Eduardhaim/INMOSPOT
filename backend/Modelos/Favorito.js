
const { DataTypes } = require('sequelize')
const sequelize = require('../db/connection')

const Favorito = sequelize.define('Favorito', {
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
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION'
    },
    propiedadId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'propiedades',
            key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION'
    }
}, {
    tableName: 'favoritos',
    timestamps: false,
    indexes: [
        {
            unique: true,
            fields: ['usuarioId', 'propiedadId']
        }
    ]
})

module.exports = Favorito
