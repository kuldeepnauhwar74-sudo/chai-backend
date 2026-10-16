import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"

const app = express()

app.use(cors({
    origin:process.env.CORS_ORIGIN,
    credentials:true
}))

app.use(express.json({limit: "16kb"}))//jab bhi ham middleware use karenge most of the time app.use ke through karenge
app.use(express.urlencoded({extnded: true, limit: "16kb"}))
app.use(express.static("public"))
app.use(cookieParser())

//routes import
import userRouter from './routes/user.routes.js'

//route declaration
app.use("/api/v1/users", userRouter)

// http://localhost:8000/api/v1/users/register

export{app};