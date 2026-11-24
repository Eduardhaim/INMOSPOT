const express = require('express')
const sequelize = require('./db/connection')
const Usuario = require('./Modelos/Usuario')
const Cliente = require('./Modelos/Cliente')
const bcrypt = require('bcryptjs')
const { randomBytes } = require('node:crypto')

const app = express()
const sesiones = new Map()

app.use(express.json())

async function validarSesion(req, resp, next) {
    try {
        const autorizacion = req.headers.authorization

        if (!autorizacion || !autorizacion.startsWith('Bearer ')) {
            return resp.status(401).json({
                mensaje: 'Debe iniciar sesion'
            })
        }

        const token = autorizacion.slice(7)
        const sesion = sesiones.get(token)

        if (!sesion || sesion.vence <= Date.now()) {
            sesiones.delete(token)

            return resp.status(401).json({
                mensaje: 'Sesion no valida o expirada'
            })
        }

        const usuario = await Usuario.findByPk(sesion.usuarioId, {
            attributes: [
                'id',
                'nombre',
                'apellido',
                'correo',
                'rol'
            ]
        })

        if (!usuario) {
            sesiones.delete(token)

            return resp.status(401).json({
                mensaje: 'Usuario no encontrado'
            })
        }

        req.usuario = usuario
        req.token = token

        next()

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al validar sesion'
        })
    }
}

function validarRol(...roles) {
    return (req, resp, next) => {
        if (!req.usuario || !roles.includes(req.usuario.rol)) {
            return resp.status(403).json({
                mensaje: 'No tiene permisos para esta operacion'
            })
        }

        next()
    }
}


// Ruta principal
app.get('/', (req, resp) => {
    resp.status(200).json({
        mensaje: 'API INMOSPOT funcionando'
    })
})

// Registro de usuarios
app.post('/registro', async (req, resp) => {
    try {
        const { nombre, apellido, correo, contrasena, rol } = req.body

        if (![nombre, apellido, correo, contrasena].every(
            dato => typeof dato === 'string' && dato.trim()
        )) {
            return resp.status(400).json({
                mensaje: 'Todos los campos son obligatorios'
            })
        }

        const roles = [
            'comprador',
            'vendedor',
            'arrendatario',
            'propietario'
        ]

        if (!roles.includes(rol)) {
            return resp.status(400).json({
                mensaje: 'Rol no valido'
            })
        }

        if (contrasena.length < 8 ||
            Buffer.byteLength(contrasena, 'utf8') > 72) {
            return resp.status(400).json({
                mensaje: 'La contrasena debe tener al menos 8 caracteres y maximo 72 bytes'
            })
        }

        const correoNormalizado = correo.trim().toLowerCase()

        const existe = await Usuario.findOne({
            where: { correo: correoNormalizado }
        })

        if (existe) {
            return resp.status(409).json({
                mensaje: 'El correo ya esta registrado'
            })
        }

        const contrasenaProtegida = await bcrypt.hash(contrasena, 10)

        const usuario = await Usuario.create({
            nombre: nombre.trim(),
            apellido: apellido.trim(),
            correo: correoNormalizado,
            contrasena: contrasenaProtegida,
            rol: rol
        })

        resp.status(201).json({
            mensaje: 'Usuario registrado correctamente',
            id: usuario.id
        })

    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return resp.status(409).json({
                mensaje: 'El correo ya esta registrado'
            })
        }

        resp.status(500).json({
            mensaje: 'Error al registrar usuario'
        })
    }
})

// Inicio de sesion
app.post('/login', async (req, resp) => {
    try {
        const { correo, contrasena } = req.body

        if (typeof correo !== 'string' ||
            typeof contrasena !== 'string' ||
            !correo.trim() || !contrasena ||
            Buffer.byteLength(contrasena, 'utf8') > 72) {
            return resp.status(400).json({
                mensaje: 'Credenciales no validas'
            })
        }

        const usuario = await Usuario.findOne({
            where: {
                correo: correo.trim().toLowerCase()
            }
        })

        if (!usuario) {
            return resp.status(401).json({
                mensaje: 'Correo o contrasena incorrectos'
            })
        }

        const valido = await bcrypt.compare(
            contrasena,
            usuario.contrasena
        )

        if (!valido) {
            return resp.status(401).json({
                mensaje: 'Correo o contrasena incorrectos'
            })
        }

        const token = randomBytes(32).toString('hex')

        sesiones.set(token, {
            usuarioId: usuario.id,
            vence: Date.now() + 8 * 60 * 60 * 1000
        })

        resp.status(200).json({
            mensaje: 'Inicio de sesion correcto',
            token: token,
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                correo: usuario.correo,
                rol: usuario.rol
            }
        })

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al iniciar sesion'
        })
    }
})

// Consultar perfil del usuario
app.get('/perfil', validarSesion, async (req, resp) => {
    try {

        resp.status(200).json(req.usuario)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar perfil'
        })
    }
})
// Cerrar sesion
app.post('/logout', validarSesion, async (req, resp) => {
    try {

        sesiones.delete(req.token)

        resp.status(200).json({
            mensaje: 'Sesion cerrada correctamente'
        })

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al cerrar sesion'
        })
    }
})

// Registrar cliente
app.post('/cliente', validarSesion, validarRol('agente'), async (req, resp) => {
    try {
        const { nombre, apellido, telefono, correo, direccion, tipo } = req.body

        if (!nombre || !apellido || !telefono || !correo || !tipo) {
            return resp.status(400).json({
                mensaje: 'Complete los campos obligatorios'
            })
        }

        const tipos = [
            'comprador',
            'vendedor',
            'arrendatario',
            'propietario'
        ]

        if (!tipos.includes(tipo)) {
            return resp.status(400).json({
                mensaje: 'Tipo de cliente no valido'
            })
        }

        const cliente = await Cliente.create({
            nombre,
            apellido,
            telefono,
            correo,
            direccion,
            tipo
        })

        resp.status(201).json(cliente)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al registrar cliente'
        })
    }
})


// Consultar clientes
app.get('/cliente', validarSesion, validarRol('agente'), async (req, resp) => {
    try {

        const clientes = await Cliente.findAll()

        resp.status(200).json(clientes)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar clientes'
        })
    }
})

// Actualizar cliente
app.put('/cliente/:id', validarSesion, validarRol('agente'), async (req, resp) => {
    try {
        const id = req.params.id
        const { nombre, apellido, telefono, correo, direccion, tipo } = req.body

        const cliente = await Cliente.findByPk(id)

        if (!cliente) {
            return resp.status(404).json({
                mensaje: 'Cliente no encontrado'
            })
        }

        if (!nombre || !apellido || !telefono || !correo || !tipo) {
            return resp.status(400).json({
                mensaje: 'Complete los campos obligatorios'
            })
        }

        const tipos = [
            'comprador',
            'vendedor',
            'arrendatario',
            'propietario'
        ]

        if (!tipos.includes(tipo)) {
            return resp.status(400).json({
                mensaje: 'Tipo de cliente no valido'
            })
        }

        await Cliente.update({
            nombre,
            apellido,
            telefono,
            correo,
            direccion,
            tipo
        }, {
            where: { id: id }
        })

        resp.status(200).json({
            mensaje: 'Cliente actualizado correctamente'
        })

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al actualizar cliente'
        })
    }
})

// Eliminar cliente
app.delete('/cliente/:id', validarSesion, validarRol('agente'), async (req, resp) => {
    try {
        const id = req.params.id

        const eliminado = await Cliente.destroy({
            where: { id: id }
        })

        if (eliminado === 0) {
            return resp.status(404).json({
                mensaje: 'Cliente no encontrado'
            })
        }

        resp.status(200).json({
            mensaje: 'Cliente eliminado correctamente'
        })

    } catch (error) {
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return resp.status(409).json({
                mensaje: 'El cliente tiene registros relacionados'
            })
        }

        resp.status(500).json({
            mensaje: 'Error al eliminar cliente'
        })
    }
})

// Conexion con la base de datos
sequelize.authenticate()
    .then(async () => {
        console.log('Conexion con BD establecida')

        await sequelize.sync()

        console.log('Tablas sincronizadas correctamente')

        app.listen(Number(process.env.PORT), () => {
            console.log('INMOSPOT ejecutando en el puerto 5000')
        })
    })
    .catch((error) => {
        console.log('Error: ' + error.message)
    })


