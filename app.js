import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import cors from "cors";
import OpenAI from "openai";
import fs from "fs"; // Import the fs module to read files

dotenv.config();

const openai = new OpenAI({apiKey:process.env.OPENAI_API_KEY}); // OpenAI API Key

const app = express();
app.use(cors());

const port = process.env.PORT || 3000;

app.use(express.json());

let authToken = null; // Variable to store the token

// Function to execute the login and extract the token
const login = async () => {
  try {
    const response = await axios.post(
      "https://thinkliteairwebapiprod.azurewebsites.net/api/Auth/Login",
      {
        email: "nbujaidar@gmail.com",
        password: "Flair123",
      }
    );

    if (response.data.status === "Success") {
      authToken = response.data.data.data.token; // Store the token in the variable
      return authToken;
    } else {
      throw new Error("Login failed");
    }
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
};

// Function to fetch data using the token
const fetchData = async (deviceId) => {
  try {
    if (!authToken) {
      authToken = await login(); // Get a new token if not available
      if (!authToken) {
        throw new Error("Failed to obtain token");
      }
    }

    const currentTime = new Date();
    const endTime = new Date(currentTime.getTime() - 10 * 60000); // 10 minutes in the past
    const startDate = currentTime.toISOString();
    const endDate = endTime.toISOString();

    const response = await axios.get(
      `https://thinkliteairwebapiprod.azurewebsites.net/api/Device/GetDeviceTelemetryV2?deviceId=${deviceId}&startDate=${endDate}&endDate=${startDate}&groupBy=1m&timeZone=America/New_York&isFlair1=false`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
      }
    );

    const fahrenheitToCelsius = (f) => {
      return ((f - 32) * 5) / 9;
    };

    return {
      cO2_ppm: response.data.data[0].cO2_ppm,
      humidity: response.data.data[0].humd,
      temperature_centigrados: fahrenheitToCelsius(response.data.data[0].temp_C),
      moldIndex: response.data.data[0].moldIndex,
      o3_ppb: response.data.data[0].o3_ppb,
      tvoCs_ppb: response.data.data[0].tvoCs_ppb,
      aqi: response.data.data[0].aqi,
      pC0_1: response.data.data[0].pC0_1,
    };
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log("Unauthorized, refreshing token...");

      try {
        authToken = await login(); // Get a new token if unauthorized
        if (!authToken) {
          throw new Error("Failed to obtain token");
        }

        // Retry the request with the new token
        const currentTime = new Date();
        const endTime = new Date(currentTime.getTime() - 10 * 60000); // 10 minutes in the past
        const startDate = currentTime.toISOString();
        const endDate = endTime.toISOString();

        const response = await axios.get(
          `https://thinkliteairwebapiprod.azurewebsites.net/api/Device/GetDeviceTelemetryV2?deviceId=${deviceId}&startDate=${endDate}&endDate=${startDate}&groupBy=1m&timeZone=America/New_York&isFlair1=false`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
          }
        );

        const fahrenheitToCelsius = (f) => {
          return ((f - 32) * 5) / 9;
        };

        return {
          cO2_ppm: response.data.data[0].cO2_ppm,
          humidity: response.data.data[0].humd,
          temperature_centigrados: fahrenheitToCelsius(response.data.data[0].temp_C),
          moldIndex: response.data.data[0].moldIndex,
          o3_ppb: response.data.data[0].o3_ppb,
          tvoCs_ppb: response.data.data[0].tvoCs_ppb,
          aqi: response.data.data[0].aqi,
          pC0_1: response.data.data[0].pC0_1,
        };
      } catch (retryError) {
        console.error("Retry error:", retryError);
        throw retryError;
      }
    } else {
      console.error("Fetch error:", error);
      throw error;
    }
  }
};

const getSensorData = async (sensorId) => {
  try {
    const response = await axios.get(
      `https://www.anapana.mx/server/getsensor.php?sensor_id=${sensorId}`
    );
    return {
      sensorId: response.data.data.sensorId,
      location_city: response.data.data.city,
      dias_libres_de_patogenos: response.data.data.days,
      dias_libres_de_moho: response.data.data.daysm,
    };
    
  } catch (error) {
    console.error("Sensor data fetch error:", error);
    throw error;
  }
};

// Usage

app.post("/generate", async (req, res) => {
  const userMessages = req.body.messages;
  const sensorID = req.body.sensorID;

  // Read the system prompt from a file
  const systemPrompt = fs.readFileSync("system_prompt.txt", "utf-8");
  // Initialize the messages array with the system prompt
  const messages = [
    { role: "system", content: systemPrompt }, // System message
  ];

  // Append user messages to the messages array

  userMessages.forEach((msg) => {
    if (msg.role === "user") {
      messages.push({ role: "user", content: msg.content });
    }
    if (msg.role === "assistant") {
      messages.push({ role: "assistant", content: msg.content });
    }
  });

  const getDashboardData = async () => {
    const [deviceData, sensorData] = await Promise.all([
      fetchData(sensorID),
      getSensorData(sensorID),
    ]);
    console.log(deviceData);
    console.log(sensorData);

    return {
      deviceData,
      sensorData,
    };
  };

  const tools = {
    name: "getDashboardData",
    description:
      "This function returns the data for the dashboard about the sensor data, location, and other details about air quality activity in real-time",
    outputs: {
      deviceData: "object",
      sensorData: "object",
    },
  };

  try {
    // Step 1: Ask GPT-3.5 if it needs to call the function
    const initialCompletion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        ...messages, // Your previous conversation or context
        {
          role: "system",
          content: `You can call a function named "getDashboardData" if you need to retrieve data about the dashboard, sensor data, and air quality. If you need to call this function, simply reply with "CALL FUNCTION getDashboardData".`,
        },
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    const initialMessageContent = initialCompletion.choices[0].message.content;

    if (initialMessageContent.includes("CALL FUNCTION getDashboardData")) {
      // Step 2: Call the function to get the required data
      const dashboardData = await getDashboardData(); // Implement this function to return the required data

      // Step 3: Re-prompt GPT-3.5 with the function data
      const finalCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          ...messages,
          {
            role: "system",
            content: `The function "getDashboardData" has been called and the data is available. Here is the data: ${JSON.stringify(
              dashboardData
            )}. You can now proceed to generate the required response based on this data.`,
          },
        ],
        max_tokens: 150,
        temperature: 0.7,
      });

      const finalMessageContent = finalCompletion.choices[0].message.content;

      res.json({
        msg: finalMessageContent,
        data: dashboardData,
      });
    } else {
      // Handle the response as a regular chat completion
      res.json({
        msg: initialMessageContent,
      });
    }
  } catch (error) {
    console.error("Error generating completion:", error);
    res.status(500).send("An error occurred while generating the completion.");
  }
});

app.listen(port, () => {
  console.log(`Server is running on ${port}`);
});
