const User = require('../models/User')

//@desc    Register user
//@route   POST /auth/register
//@access  Public
exports.register = async (req, res, next) => {
	try {
		const { username, email, password, role = 'user' } = req.body

		// Check if user already exists
		const existingUser = await User.findOne({ 
			$or: [{ email }, { username }] 
		})

		if (existingUser) {
			if (existingUser.email === email) {
				return res.status(400).json({ 
					success: false, 
					message: 'User with this email already exists' 
				})
			}
			if (existingUser.username === username) {
				return res.status(400).json({ 
					success: false, 
					message: 'Username already taken' 
				})
			}
		}

		//Create user
		const user = await User.create({
			username,
			email,
			password,
			role
		})

		sendTokenResponse(user, 201, res)
	} catch (err) {
		console.log(err);
		
		// Handle MongoDB duplicate key error
		if (err.code === 11000) {
			const field = Object.keys(err.keyValue)[0]
			const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
			return res.status(400).json({ success: false, message })
		}
		
		// Handle validation errors
		if (err.name === 'ValidationError') {
			const message = Object.values(err.errors).map(error => error.message).join(', ')
			return res.status(400).json({ success: false, message })
		}
		
		res.status(500).json({ 
			success: false, 
			message: 'Server error during registration' 
		})
	}
}

//@desc		Login user
//@route	POST /auth/login
//@access	Public
exports.login = async (req, res, next) => {
	try {
		const { username, password } = req.body

		//Validate email & password
		if (!username || !password) {
			return res.status(400).json({ 
				success: false, 
				message: 'Please provide a username and password' 
			})
		}

		//Check for user
		const user = await User.findOne({ username }).select('+password')

		if (!user) {
			return res.status(401).json({ 
				success: false, 
				message: 'Invalid credentials' 
			})
		}

		//Check if password matches
		const isMatch = await user.matchPassword(password)

		if (!isMatch) {
			return res.status(401).json({ 
				success: false, 
				message: 'Invalid credentials' 
			})
		}

		sendTokenResponse(user, 200, res)
	} catch (err) {
		console.log(err);
		res.status(500).json({ 
			success: false, 
			message: 'Server error during login' 
		})
	}
}

//Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
	try {
		//Create token
		const token = user.getSignedJwtToken()

		const options = {
			expires: new Date(Date.now() + (process.env.JWT_COOKIE_EXPIRE || 30) * 24 * 60 * 60 * 1000),
			httpOnly: true
		}

		if (process.env.NODE_ENV === 'production') {
			options.secure = true
		}
		
		res.status(statusCode).cookie('token', token, options).json({
			success: true,
			token,
			user: {
				id: user._id,
				username: user.username,
				email: user.email,
				role: user.role
			}
		})
	} catch (err) {
		console.log('Token generation error:', err);
		res.status(500).json({ 
			success: false, 
			message: 'Error generating authentication token' 
		})
	}
}

//@desc		Get current Logged in user
//@route 	GET /auth/me
//@access	Private
exports.getMe = async (req, res, next) => {
	try {
		const user = await User.findById(req.user.id)
		
		if (!user) {
			return res.status(404).json({ 
				success: false, 
				message: 'User not found' 
			})
		}
		
		res.status(200).json({
			success: true,
			data: user
		})
	} catch (err) {
		console.log(err);
		res.status(500).json({ 
			success: false, 
			message: 'Server error retrieving user data' 
		})
	}
}

//@desc		Get user's tickets
//@route 	GET /auth/tickets
//@access	Private
exports.getTickets = async (req, res, next) => {
	try {
		const user = await User.findById(req.user.id, { tickets: 1 }).populate({
			path: 'tickets.showtime',
			populate: [
				'movie',
				{ path: 'theater', populate: { path: 'cinema', select: 'name' }, select: 'cinema number' }
			],
			select: 'theater movie showtime isRelease'
		})

		if (!user) {
			return res.status(404).json({ 
				success: false, 
				message: 'User not found' 
			})
		}

		res.status(200).json({
			success: true,
			data: user
		})
	} catch (err) {
		console.log(err);
		res.status(500).json({ 
			success: false, 
			message: 'Server error retrieving tickets' 
		})
	}
}

//@desc		Log user out / clear cookie
//@route 	GET /auth/logout
//@access	Private
exports.logout = async (req, res, next) => {
	try {
		res.cookie('token', 'none', {
			expires: new Date(Date.now() + 10 * 1000),
			httpOnly: true
		})

		res.status(200).json({
			success: true,
			message: 'User logged out successfully'
		})
	} catch (err) {
		console.log(err);
		res.status(500).json({ 
			success: false, 
			message: 'Server error during logout' 
		})
	}
}

//@desc		Get All user
//@route 	GET /auth/users
//@access	Private Admin
exports.getAll = async (req, res, next) => {
	try {
		const users = await User.find().populate({
			path: 'tickets.showtime',
			populate: [
				'movie',
				{ path: 'theater', populate: { path: 'cinema', select: 'name' }, select: 'cinema number' }
			],
			select: 'theater movie showtime isRelease'
		})

		res.status(200).json({
			success: true,
			count: users.length,
			data: users
		})
	} catch (err) {
		console.log(err);
		res.status(500).json({ 
			success: false, 
			message: 'Server error retrieving users' 
		})
	}
}

//@desc		Delete user
//@route 	DELETE /auth/user/:id
//@access	Private Admin
exports.deleteUser = async (req, res, next) => {
	try {
		const user = await User.findByIdAndDelete(req.params.id)

		if (!user) {
			return res.status(404).json({ 
				success: false, 
				message: `User not found with id of ${req.params.id}` 
			})
		}
		
		res.status(200).json({ 
			success: true, 
			message: 'User deleted successfully' 
		})
	} catch (err) {
		console.log(err);
		res.status(500).json({ 
			success: false, 
			message: 'Server error deleting user' 
		})
	}
}

//@desc     Update user
//@route    PUT /auth/user/:id
//@access   Private
exports.updateUser = async (req, res, next) => {
	try {
		const user = await User.findByIdAndUpdate(req.params.id, req.body, {
			new: true,
			runValidators: true
		})

		if (!user) {
			return res.status(404).json({ 
				success: false, 
				message: `User not found with id of ${req.params.id}` 
			})
		}
		
		res.status(200).json({ 
			success: true, 
			data: user 
		})
	} catch (err) {
		console.log(err);
		
		// Handle MongoDB duplicate key error
		if (err.code === 11000) {
			const field = Object.keys(err.keyValue)[0]
			const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
			return res.status(400).json({ success: false, message })
		}
		
		// Handle validation errors
		if (err.name === 'ValidationError') {
			const message = Object.values(err.errors).map(error => error.message).join(', ')
			return res.status(400).json({ success: false, message })
		}
		
		res.status(500).json({ 
			success: false, 
			message: 'Server error updating user' 
		})
	}
}