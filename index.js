const express = require('express');
const app = express();
const cors = require('cors');
const mongodb = require('mongodb');
const mongoClient = mongodb.MongoClient;
const fast2sms = require('fast-two-sms')
const jwt = require('jsonwebtoken');
require('dotenv').config();
let port = process.env.PORT || 4020;
let dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017';

app.use(express.json());
app.use(cors());

//api for posting mobile number while signup ,user verification,otp generation and calling sendOtp() function.
app.post("/signUpMobileNo",async(req,res)=>{
   try{
      let clientInfo = await mongoClient.connect(dbUrl);
      let db = clientInfo.db('app');
      let check = await db.collection("users").findOne({mobileNo: +req.body.mobileNo});
      if(check){
          if(check.signupStatus === 1){
          res.status(400).json({message:"User already exist"})
          }
          else{
            let otp = Math.floor((Math.random()*(9999-1000))+1000);
            await db.collection("users").findOneAndUpdate({mobileNo: +req.body.mobileNo},{$set:{userOtp: otp}}); 
            sendOtp(otp,"Signup", +req.body.mobileNo);
            res.status(200).json({Message:"OTP send"}); 
          }     
       }
      else{      
        let otp = Math.floor((Math.random()*(9999-1000))+1000);
        let data = {mobileNo: +req.body.mobileNo, name:"", userOtp: otp, otpStatus:0,signupStatus:0}
        await db.collection("users").insertOne(data);
        sendOtp(otp,"Signup",+req.body.mobileNo);
        res.status(200).json({Message:"OTP send"});
      }

      clientInfo.close();  
   }
   catch(e){
       console.log(e);
   }      
})



//api for posting otp received by user and send the results according to.
app.post('/verifySignupOtp',async(req,res)=>{
    try{
      let clientInfo = await mongoClient.connect(dbUrl);
      let db = clientInfo.db('app');
      let findData = await db.collection("users").findOne({mobileNo:+req.body.mobileNo});
      if(findData.userOtp === +req.body.otp ){         
        await db.collection("users").findOneAndUpdate({mobileNo:+req.body.mobileNo},{$set:{otpStatus:1}});
        res.status(200).json({message:"OTP is verified"})  
      }    
      else{
        res.status(400).json({message:"Wrong otp."})   
      }                     
      clientInfo.close();  
    }
    catch(e){
       console.log(e);
    }
})

//api for posting name of the user.
app.post("/postName",async(req,res)=>{
    try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('app');
        let historyData = {mobileNo:+req.body.mobileNo, history:[]};
        let userData = await db.collection("users").findOne({mobileNo:+req.body.mobileNo});
        await db.collection("users").findOneAndUpdate({mobileNo:+req.body.mobileNo},{$set:{name:req.body.name,signupStatus:1}});
        await db.collection("history").insertOne(historyData);       
            let token = await jwt.sign(
              {user_id: userData._id},
              process.env.JWT_KEY
          ) 
            await db.collection("users").findOneAndUpdate({mobileNo:+req.body.mobileNo},{$set:{otpStatus:1}}); 
            res.status(200).json({message:"user created",token:token})          
        res.status(200).json({message:"User created"});        
        clientInfo.close();    
    }
    catch(e){
        console.log(e);
    }
})

//below api is used for getting mobile nomber from user and sending login otp to user.
app.post("/loginMobile",async(req,res)=>{
    try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('app');
        let find = await db.collection("users").findOne({mobileNo: +req.body.mobileNo});
        if(find){
            let otp2 = Math.floor((Math.random()*(9999-1000))+1000);  
            //let postData = {mobileNo:+req.body.mobileNo,loginOtp:otp2,loginStatus:0};
            await db.collection("users").findOneAndUpdate({mobileNo:+req.body.mobileNo},{$set:{userOtp:otp2}});
            sendOtp(otp2,"login",req.body.mobileNo)          
            res.status(200).json({message:"loginOtp has sent."})
        }
        else{
          res.status(404).json({message:"Please Signup first"})  
        }
        clientInfo.close();        
    }
    catch(e){
        console.log(e);
    }
})

//below api is used for verification of login otp.
app.post("/verifyLoginOtp",async(req,res)=>{
    try{
       let clientInfo = await mongoClient.connect(dbUrl);
       let db = clientInfo.db("app");
       let userData = await db.collection("users").findOne({mobileNo:+req.body.mobileNo});
       if(userData.userOtp === +req.body.otp){
          let token = await jwt.sign(
            {user_id: userData._id},
            process.env.JWT_KEY
        ) 
          await db.collection("users").findOneAndUpdate({mobileNo:+req.body.mobileNo},{$set:{otpStatus:1}}); 
          res.status(200).json({message:"Login success",token:token, name:userData.name}) 
       }
       else{
          res.status(404).json({message:"Wrong login otp"})          
       }
       clientInfo.close();
    } 
    catch(e){
       console.log(e)
    }
})

//below api is used for logging out.
app.put('/logout/:mobile',async(req,res)=>{
    try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db("app")
        await db.collection("users").findOneAndUpdate({mobileNo:+req.params.mobile},{$set:{userOtp:0,otpStatus:0}});  
        res.status(200).json({message:"logout success"});
        clientInfo.close();
    }
    catch(e){
        console.log(e);
    }
})

//below api is used for posting history data of user to db.
app.post("/postSwipingHistory", authenticate,async(req,res)=>{
    try{
       let clientInfo = await mongoClient.connect(dbUrl);
       let db = clientInfo.db("app");
       let historyData= await db.collection("history").findOne({mobileNo:+req.body.mobileNo});
       historyData.history.unshift(...req.body.history);
       await db.collection("history").findOneAndUpdate({mobileNo:+req.body.mobileNo},{$set:{history:historyData.history}});
       res.status(200).json({message:"Success"});
       clientInfo.close();        
    }
    catch(e){
        console.log(e); 
    }
})

//below api is used for getting history data of user.
app.get("/userHistory/:mobileNo", authenticate,async(req,res)=>{
    try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db("app");
        let historyData= await db.collection("history").findOne({mobileNo:+req.params.mobileNo});
        res.status(200).json({message:"success",data:historyData.history});
        clientInfo.close();
    }
    catch(e){
       console.log(e);
    }
})

//authenticate() is a middleware used to check authentication of request from client-side.
function authenticate(req,res,next){
    if(req.headers.authorisation !== undefined){
        jwt.verify(
            req.headers.authorisation,
            process.env.JWT_KEY,
            (err,decode)=>{
                 if(decode !== undefined){
                     next();
                 } 
                 else{
                    res.status(401).json({message:"No authorisation."});                    
                 }
            }
        )
    }
    else{
       res.status(401).json({message:"No authorisation."}); 
    }
}

//used fast-two-sms for sending authentication messages to the user.
//sendOtp() used to send otp to user for signup or login authorisation.
const sendOtp = async(otp,subject,mobileNo)=>{
    var options = {authorization : process.env.API_KEY , message : 'Your '+subject+' OTP is '+ otp ,  numbers : [mobileNo]}
    let response = await fast2sms.sendMessage(options);
    console.log(response.message);
}

app.listen(port,()=>console.log("Server is running on"+ port))