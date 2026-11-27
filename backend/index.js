const express = require('express')
const sequelize = require('./db/connection')
const Usuario = require('./Modelos/Usuario')
const Cliente = require('./Modelos/Cliente')
const Propiedad = require('./Modelos/Propiedad')
const bcrypt = require('bcryptjs')
const Fotografia = require('./Modelos/Fotografia')
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

        const usuarios = await Usuario.findAll({
            where: { id: sesion.usuarioId },
            attributes: [
                'id',
                'nombre',
                'apellido',
                'correo',
                'rol'
            ]
        })

        const usuario = usuarios[0]

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
        const { nombre, apellido, correo, contrasena, rol } = req.body || {}

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

        const existe = await Usuario.findAll({
            where: { correo: correoNormalizado }
        })

        if (existe.length > 0) {
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
        const { correo, contrasena } = req.body || {}

        if (typeof correo !== 'string' ||
            typeof contrasena !== 'string' ||
            !correo.trim() || !contrasena ||
            Buffer.byteLength(contrasena, 'utf8') > 72) {
            return resp.status(400).json({
                mensaje: 'Credenciales no validas'
            })
        }

        const usuarios = await Usuario.findAll({
            where: {
                correo: correo.trim().toLowerCase()
            }
        })

        const usuario = usuarios[0]

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
        const {
            nombre,
            apellido,
            telefono,
            correo,
            direccion,
            tipo,
            usuarioId
        } = req.body || {}

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

        if (usuarioId !== undefined && usuarioId !== null) {

            if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
                return resp.status(400).json({
                    mensaje: 'Usuario no valido'
                })
            }

            const usuario = await Usuario.findByPk(usuarioId)

            if (!usuario) {
                return resp.status(404).json({
                    mensaje: 'Usuario no encontrado'
                })
            }

            if (usuario.rol !== tipo) {
                return resp.status(400).json({
                    mensaje: 'El rol del usuario no coincide con el tipo de cliente'
                })
            }

            const clienteExistente = await Cliente.findOne({
                where: { usuarioId: usuarioId }
            })

            if (clienteExistente) {
                return resp.status(409).json({
                    mensaje: 'El usuario ya tiene un cliente asociado'
                })
            }
        }

        const cliente = await Cliente.create({
            nombre,
            apellido,
            telefono,
            correo,
            direccion,
            tipo,
            usuarioId
        })

        resp.status(201).json(cliente)

    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return resp.status(409).json({
                mensaje: 'El usuario ya tiene un cliente asociado'
            })
        }

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

        const {
            nombre,
            apellido,
            telefono,
            correo,
            direccion,
            tipo,
            usuarioId
        } = req.body || {}

        const clientes = await Cliente.findAll({
            where: { id: id }
        })

        if (clientes.length == 0) {
            return resp.status(404).json({
                mensaje: 'Cliente no encontrado'
            })
        }

        const cliente = clientes[0]

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

        let usuarioAsociado = cliente.usuarioId

        if (usuarioId !== undefined) {

            if (cliente.usuarioId !== null &&
                usuarioId !== cliente.usuarioId) {
                return resp.status(409).json({
                    mensaje: 'No puede cambiar la cuenta asociada al cliente'
                })
            }

            usuarioAsociado = usuarioId
        }

        if (usuarioAsociado !== null) {

            if (!Number.isInteger(usuarioAsociado) ||
                usuarioAsociado <= 0) {
                return resp.status(400).json({
                    mensaje: 'Usuario no valido'
                })
            }

            const usuario = await Usuario.findByPk(usuarioAsociado)

            if (!usuario) {
                return resp.status(404).json({
                    mensaje: 'Usuario no encontrado'
                })
            }

            if (usuario.rol !== tipo) {
                return resp.status(400).json({
                    mensaje: 'El rol del usuario no coincide con el tipo de cliente'
                })
            }

            const clienteExistente = await Cliente.findOne({
                where: { usuarioId: usuarioAsociado }
            })

            if (clienteExistente &&
                clienteExistente.id !== cliente.id) {
                return resp.status(409).json({
                    mensaje: 'El usuario ya tiene un cliente asociado'
                })
            }
        }

        await Cliente.update({
            nombre,
            apellido,
            telefono,
            correo,
            direccion,
            tipo,
            usuarioId: usuarioAsociado
        }, {
            where: { id: id }
        })

        resp.status(200).json({
            mensaje: 'Cliente actualizado correctamente'
        })

    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return resp.status(409).json({
                mensaje: 'El usuario ya tiene un cliente asociado'
            })
        }

        resp.status(500).json({
            mensaje: 'Error al actualizar cliente'
        })
    }
})

// Consultar bienes inmuebles de un cliente
app.get('/cliente/:id/propiedades', validarSesion, validarRol('agente', 'vendedor', 'propietario'), async (req, resp) => {
    try {

        const id = req.params.id

        const cliente = await Cliente.findByPk(id)

        if (!cliente) {
            return resp.status(404).json({
                mensaje: 'Cliente no encontrado'
            })
        }

        if (req.usuario.rol !== 'agente' &&
            cliente.usuarioId !== req.usuario.id) {
            return resp.status(403).json({
                mensaje: 'No tiene permisos'
            })
        }

        const propiedades = await Propiedad.findAll({
            where: {
                clienteId: id
            }
        })

        resp.status(200).json({
            clienteId: cliente.id,
            nombre: cliente.nombre,
            apellido: cliente.apellido,
            totalBienes: propiedades.length,
            propiedades: propiedades
        })

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar bienes del cliente'
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

// Registrar propiedad
app.post('/propiedad', validarSesion, validarRol('vendedor', 'propietario', 'agente'), async (req, resp) => {
    try {
        const {
            titulo,
            descripcion,
            tipo,
            finalidad,
            precio,
            ubicacion,
            zona,
            caracteristicas,
            clienteId
        } = req.body || {}

        if (![titulo, descripcion, ubicacion, zona].every(
            dato => typeof dato === 'string' && dato.trim()
        )) {
            return resp.status(400).json({
                mensaje: 'Complete los campos obligatorios'
            })
        }

        const tipos = ['casa', 'apartamento', 'terreno', 'local']

        if (!tipos.includes(tipo)) {
            return resp.status(400).json({
                mensaje: 'Tipo de propiedad no valido'
            })
        }

        if (!['venta', 'alquiler'].includes(finalidad)) {
            return resp.status(400).json({
                mensaje: 'Finalidad no valida'
            })
        }

        if (typeof precio !== 'number' ||
            !Number.isFinite(precio) ||
            precio <= 0 ||
            precio > 9999999999.99) {
            return resp.status(400).json({
                mensaje: 'Precio no valido'
            })
        }

        let cliente

        if (req.usuario.rol === 'agente') {

            if (!Number.isInteger(clienteId) || clienteId <= 0) {
                return resp.status(400).json({
                    mensaje: 'Debe seleccionar un cliente'
                })
            }

            cliente = await Cliente.findByPk(clienteId)

            if (!cliente) {
                return resp.status(404).json({
                    mensaje: 'Cliente no encontrado'
                })
            }

        } else {

            cliente = await Cliente.findOne({
                where: {
                    usuarioId: req.usuario.id
                }
            })

            if (!cliente) {
                return resp.status(400).json({
                    mensaje: 'El usuario no tiene un cliente asociado'
                })
            }

            if (clienteId !== undefined && clienteId !== cliente.id) {
                return resp.status(403).json({
                    mensaje: 'No puede registrar propiedades de otro cliente'
                })
            }
        }

        const propiedad = await Propiedad.create({
            titulo,
            descripcion,
            tipo,
            finalidad,
            precio,
            ubicacion,
            zona,
            caracteristicas,
            estado: 'disponible',
            usuarioId: req.usuario.id,
            clienteId: cliente.id
        })

        resp.status(201).json(propiedad)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al registrar propiedad'
        })
    }
})

// Consultar propiedades
app.get('/propiedad', validarSesion, async (req, resp) => {
    try {
        let condiciones = {}

        if (req.usuario.rol === 'comprador') {
            condiciones = {
                estado: 'disponible',
                finalidad: 'venta'
            }
        }

        if (req.usuario.rol === 'arrendatario') {
            condiciones = {
                estado: 'disponible',
                finalidad: 'alquiler'
            }
        }

        if (['vendedor', 'propietario'].includes(req.usuario.rol)) {

            const cliente = await Cliente.findOne({
                where: {
                    usuarioId: req.usuario.id
                }
            })

            if (!cliente) {
                return resp.status(200).json([])
            }

            condiciones = {
                clienteId: cliente.id
            }
        }

        const propiedades = await Propiedad.findAll({
            where: condiciones
        })

        resp.status(200).json(propiedades)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar propiedades'
        })
    }
})

// Actualizar propiedad
app.put('/propiedad/:id', validarSesion, validarRol('vendedor', 'propietario', 'agente'), async (req, resp) => {
    try {
        const id = req.params.id

        const propiedades = await Propiedad.findAll({
            where: { id: id }
        })

        const propiedad = propiedades[0]

        if (!propiedad) {
            return resp.status(404).json({
                mensaje: 'Propiedad no encontrada'
            })
        }

        const {
            titulo,
            descripcion,
            tipo,
            finalidad,
            precio,
            ubicacion,
            zona,
            caracteristicas,
            clienteId
        } = req.body || {}

        if (![titulo, descripcion, ubicacion, zona].every(
            dato => typeof dato === 'string' && dato.trim()
        )) {
            return resp.status(400).json({
                mensaje: 'Complete los campos obligatorios'
            })
        }

        if (!['casa', 'apartamento', 'terreno', 'local'].includes(tipo)) {
            return resp.status(400).json({
                mensaje: 'Tipo de propiedad no valido'
            })
        }

        if (!['venta', 'alquiler'].includes(finalidad)) {
            return resp.status(400).json({
                mensaje: 'Finalidad no valida'
            })
        }

        if (typeof precio !== 'number' ||
            !Number.isFinite(precio) ||
            precio <= 0 ||
            precio > 9999999999.99) {
            return resp.status(400).json({
                mensaje: 'Precio no valido'
            })
        }

        let clientePropietarioId = propiedad.clienteId

        if (req.usuario.rol === 'agente') {

            if (clienteId !== undefined) {
                clientePropietarioId = clienteId
            }

            if (!Number.isInteger(clientePropietarioId) ||
                clientePropietarioId <= 0) {
                return resp.status(400).json({
                    mensaje: 'Debe seleccionar un cliente'
                })
            }

            const cliente = await Cliente.findByPk(clientePropietarioId)

            if (!cliente) {
                return resp.status(404).json({
                    mensaje: 'Cliente no encontrado'
                })
            }

        } else {

            const cliente = await Cliente.findOne({
                where: {
                    usuarioId: req.usuario.id
                }
            })

            if (!cliente || propiedad.clienteId !== cliente.id) {
                return resp.status(403).json({
                    mensaje: 'No tiene permisos para modificar esta propiedad'
                })
            }

            if (clienteId !== undefined && clienteId !== cliente.id) {
                return resp.status(403).json({
                    mensaje: 'No puede cambiar el propietario del inmueble'
                })
            }

            clientePropietarioId = cliente.id
        }

        await Propiedad.update({
            titulo,
            descripcion,
            tipo,
            finalidad,
            precio,
            ubicacion,
            zona,
            caracteristicas,
            clienteId: clientePropietarioId
        }, {
            where: { id: id }
        })

        resp.status(200).json({
            mensaje: 'Propiedad actualizada correctamente'
        })

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al actualizar propiedad'
        })
    }
})



// Eliminar propiedad
app.delete('/propiedad/:id', validarSesion, validarRol('vendedor', 'propietario', 'agente'), async (req, resp) => {
    try {
        const id = req.params.id

        const propiedades = await Propiedad.findAll({
            where: { id: id }
        })

        const propiedad = propiedades[0]

        if (!propiedad) {
            return resp.status(404).json({
                mensaje: 'Propiedad no encontrada'
            })
        }

        if (req.usuario.rol !== 'agente') {

            const cliente = await Cliente.findOne({
                where: {
                    usuarioId: req.usuario.id
                }
            })

            if (!cliente || propiedad.clienteId !== cliente.id) {
                return resp.status(403).json({
                    mensaje: 'No tiene permisos para eliminar esta propiedad'
                })
            }
        }

        if (propiedad.estado !== 'disponible') {
            return resp.status(409).json({
                mensaje: 'La propiedad no esta disponible para eliminar'
            })
        }

        const eliminado = await Propiedad.destroy({
            where: { id: id }
        })

        if (eliminado == 0) {
            return resp.status(404).json({
                mensaje: 'Propiedad no encontrada'
            })
        }

        resp.status(200).json({
            mensaje: 'Propiedad eliminada correctamente'
        })

    } catch (error) {
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return resp.status(409).json({
                mensaje: 'La propiedad tiene registros relacionados'
            })
        }

        resp.status(500).json({
            mensaje: 'Error al eliminar propiedad'
        })
    }
})


// Consultar detalle de propiedad
app.get('/propiedad/:id', validarSesion, async (req, resp) => {
    try {

        let condiciones = {
            id: req.params.id
        }

        if (req.usuario.rol === 'comprador') {
            condiciones.estado = 'disponible'
            condiciones.finalidad = 'venta'
        }

        if (req.usuario.rol === 'arrendatario') {
            condiciones.estado = 'disponible'
            condiciones.finalidad = 'alquiler'
        }

        if (req.usuario.rol === 'vendedor' ||
            req.usuario.rol === 'propietario') {

            const cliente = await Cliente.findOne({
                where: {
                    usuarioId: req.usuario.id
                }
            })

            if (!cliente) {
                return resp.status(404).json({
                    mensaje: 'Propiedad no encontrada'
                })
            }

            condiciones.clienteId = cliente.id
        }

        const propiedad = await Propiedad.findAll({
            where: condiciones
        })

        if (propiedad.length > 0) {
            resp.status(200).json(propiedad[0])
        }
        else {
            resp.status(404).json({
                mensaje: 'Propiedad no encontrada'
            })
        }

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar propiedad'
        })
    }
})

// Actualizar estado de propiedad
app.put('/propiedad/:id/estado', validarSesion, validarRol('agente'), async (req, resp) => {
    try {
        const id = req.params.id
        const { estado } = req.body || {}

        const propiedad = await Propiedad.findAll({
            where: { id: id }
        })

        if (propiedad.length == 0) {
            return resp.status(404).json({
                mensaje: 'Propiedad no encontrada'
            })
        }

        if (estado != 'disponible' && estado != 'reservada') {
            return resp.status(400).json({
                mensaje: 'Estado no valido'
            })
        }

        if (propiedad[0].estado == 'vendida' ||
            propiedad[0].estado == 'alquilada') {
            return resp.status(409).json({
                mensaje: 'La propiedad tiene una operacion finalizada'
            })
        }

        await Propiedad.update({
            estado: estado
        }, {
            where: { id: id }
        })

        resp.status(200).json({
            mensaje: 'Estado actualizado correctamente'
        })

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al actualizar estado'
        })
    }
})


// Buscar propiedades por tipo y zona
app.get('/propiedad/buscar/:tipo/:zona', validarSesion, async (req, resp) => {
    try {

        let condiciones = {}

        if (req.usuario.rol === 'comprador') {
            condiciones.estado = 'disponible'
            condiciones.finalidad = 'venta'
        }

        if (req.usuario.rol === 'arrendatario') {
            condiciones.estado = 'disponible'
            condiciones.finalidad = 'alquiler'
        }

        if (req.usuario.rol === 'vendedor' ||
            req.usuario.rol === 'propietario') {

            const cliente = await Cliente.findOne({
                where: {
                    usuarioId: req.usuario.id
                }
            })

            if (!cliente) {
                return resp.status(200).json([])
            }

            condiciones.clienteId = cliente.id
        }

        if (req.params.tipo !== 'todos') {
            condiciones.tipo = req.params.tipo
        }

        if (req.params.zona !== 'todas') {
            condiciones.zona = req.params.zona
        }

        const propiedades = await Propiedad.findAll({
            where: condiciones
        })

        resp.status(200).json(propiedades)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al buscar propiedades'
        })
    }
})


// Registrar fotografia
app.post('/fotografia', validarSesion, validarRol('vendedor', 'propietario', 'agente'), async (req, resp) => {
    try {

        const { url, propiedadId } = req.body || {}

        if (typeof url !== 'string' || !url.trim() ||
            url.length > 255 || !propiedadId) {
            return resp.status(400).json({
                mensaje: 'Complete los campos correctamente'
            })
        }

        const propiedad = await Propiedad.findAll({
            where: { id: propiedadId }
        })

        if (propiedad.length == 0) {
            return resp.status(404).json({
                mensaje: 'Propiedad no encontrada'
            })
        }

        if (req.usuario.rol !== 'agente') {

            const cliente = await Cliente.findOne({
                where: {
                    usuarioId: req.usuario.id
                }
            })

            if (!cliente || propiedad[0].clienteId !== cliente.id) {
                return resp.status(403).json({
                    mensaje: 'No tiene permisos'
                })
            }
        }

        const fotografia = await Fotografia.create({
            url,
            propiedadId
        })

        resp.status(201).json(fotografia)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al registrar fotografia'
        })
    }
})


// Consultar fotografias de una propiedad
app.get('/fotografia/:propiedadId', validarSesion, async (req, resp) => {
    try {

        let condiciones = {
            id: req.params.propiedadId
        }

        if (req.usuario.rol === 'comprador') {
            condiciones.estado = 'disponible'
            condiciones.finalidad = 'venta'
        }

        if (req.usuario.rol === 'arrendatario') {
            condiciones.estado = 'disponible'
            condiciones.finalidad = 'alquiler'
        }

        if (req.usuario.rol === 'vendedor' ||
            req.usuario.rol === 'propietario') {

            const cliente = await Cliente.findOne({
                where: {
                    usuarioId: req.usuario.id
                }
            })

            if (!cliente) {
                return resp.status(404).json({
                    mensaje: 'Propiedad no encontrada'
                })
            }

            condiciones.clienteId = cliente.id
        }

        const propiedad = await Propiedad.findAll({
            where: condiciones
        })

        if (propiedad.length == 0) {
            return resp.status(404).json({
                mensaje: 'Propiedad no encontrada'
            })
        }

        const fotografias = await Fotografia.findAll({
            where: {
                propiedadId: req.params.propiedadId
            }
        })

        resp.status(200).json(fotografias)

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al consultar fotografias'
        })
    }
})




// Eliminar fotografia
app.delete('/fotografia/:id', validarSesion, validarRol('vendedor', 'propietario', 'agente'), async (req, resp) => {
    try {

        const fotografia = await Fotografia.findAll({
            where: { id: req.params.id }
        })

        if (fotografia.length == 0) {
            return resp.status(404).json({
                mensaje: 'Fotografia no encontrada'
            })
        }

        const propiedad = await Propiedad.findAll({
            where: {
                id: fotografia[0].propiedadId
            }
        })

        if (propiedad.length == 0) {
            return resp.status(404).json({
                mensaje: 'Propiedad no encontrada'
            })
        }

        if (req.usuario.rol !== 'agente') {

            const cliente = await Cliente.findOne({
                where: {
                    usuarioId: req.usuario.id
                }
            })

            if (!cliente || propiedad[0].clienteId !== cliente.id) {
                return resp.status(403).json({
                    mensaje: 'No tiene permisos'
                })
            }
        }

        await Fotografia.destroy({
            where: { id: req.params.id }
        })

        resp.status(200).json({
            mensaje: 'Fotografia eliminada correctamente'
        })

    } catch (error) {
        resp.status(500).json({
            mensaje: 'Error al eliminar fotografia'
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