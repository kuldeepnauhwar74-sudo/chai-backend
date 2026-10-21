
// get user details from frontend
// validation - not empty
// check if user already exists: username, email
// check for images, check for avatar
// upload them to cloudinary, avatar
// create user object - create entry in db
// remove password and refresh token field from response
// check for user creation
// return res

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"


const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})

        return {accessToken, refreshToken}

    } catch (error) {
        throw new ApiError(
            500,
            "Something went wrong while generating refresh and access token"
        );
    }
};

const registerUser = asyncHandler(async (req, res) => {
    const { fullName, email, username, password } = req.body || {};

    // Validate required fields
    if ([fullName, email, username, password].some(
        (field) => !field || (typeof field === "string" && field.trim() === "")
    )) {
        throw new ApiError(400, "All fields are required");
    }

    // Check existing user
    const existedUser = await User.findOne({
        $or: [
            { username: username.toLowerCase() },
            { email: email.toLowerCase() }
        ]
    });

    if (existedUser) {
        throw new ApiError(
            409,
            "User with email or username already exists"
        );
    }
    console.log(req.files)

    // Get uploaded file paths safely
    const avatarLocalPath = req.files?.avatar?.[0]?.path;
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required");
    }

    // Upload avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar?.url) {
        throw new ApiError(500, "Avatar upload failed: Check Cloudinary credentials (CLOUDINARY_CLOUD_NAME) in .env");
    }

    // Upload cover image only if provided
    let coverImageUrl = "";

    if (coverImageLocalPath) {
        const coverImage = await uploadOnCloudinary(
            coverImageLocalPath
        );

        if (coverImage?.url) {
            coverImageUrl = coverImage.url;
        }
    }

    // Create user
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImageUrl,
        email: email.toLowerCase(),
        password,
        username: username.toLowerCase()
    });

    // Remove sensitive fields from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if (!createdUser) {
        throw new ApiError(
            500,
            "Something went wrong while registering the user"
        );
    }

    return res.status(201).json(
        new ApiResponse(
            201,
            createdUser,
            "User registered successfully"
        )
    );
});

const loginUser = asyncHandler(async (req, res)=>{
 // req body -> data
// username or email
// find the user
// password check
// access and refresh token
// send cookie
const { email, username, password } = req.body;

if (!username && !email) {
    throw new ApiError(400, "username or email is required");
}

const user = await User.findOne({
    $or: [{ username }, { email }]
});

if (!user) {
    throw new ApiError(404, "User does not exist");
}

const isPasswordValid = await user.isPasswordCorrect(password);

if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
}

const {accessToken, refreshToken} = await
 generateAccessAndRefreshTokens(user._id)

 const loggedInUser = await User.findById(user._id)
    .select("-password -refreshToken");

const options = {
    httpOnly: true,
    secure: true
};

return res
.status(200)
.cookie("accessToken", accessToken, options)
.cookie("refreshToken", refreshToken, options)
.json(
    new ApiResponse(
        200,
        {
            user: loggedInUser, accessToken,
            refreshToken
        },
        "User logged in successfully"
    )
)

})

const logoutUser = asyncHandler(async(req, res)=>{
    await User.findByIdAndUpdate(
    req.user._id,
    {
        $set: {
            refreshToken: undefined
        }
    },
    {
        new: true
    }
);

const options = {
    httpOnly: true,
    secure: true
};

return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out"));

})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken =
        req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Refresh token is required");
    }
    
   try {
     const decodedToken = jwt.verify(
     incomingRefreshToken,
     process.env.REFRESH_TOKEN_SECRET
 );
 
 const user = await User.findById(decodedToken?._id);
 
 if (!user) {
     throw new ApiError(401, "Invalid refresh token request");
 }
 
 if (incomingRefreshToken !== user?.refreshToken) {
     throw new ApiError(401, "Refresh token is expired or used");
 }
 
 const options = {
     httpOnly: true,
     secure: true
 };
 
 const { accessToken, newRefreshToken } =
     await generateAccessAndRefreshTokens(user._id);
 
 return res
     .status(200)
     .cookie("accessToken", accessToken, options)
     .cookie("refreshToken", newRefreshToken, options)
     .json(
         new ApiResponse(
             200,
             {
                 accessToken,
                 refreshToken: newRefreshToken
             },
             "Access token refreshed"
         )
     );
   } catch (error) {
    throw new ApiError(401, error?.mssage || "Invalid refresh tokeen")
    
   }
});

export { registerUser,
         loginUser,
         logoutUser,
         refreshAccessToken
};
