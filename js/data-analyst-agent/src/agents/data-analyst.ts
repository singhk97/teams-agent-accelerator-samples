import * as fs from 'fs';
import * as path from 'path';
import { Card } from '@teams.sdk/cards';
import { createLogger } from '../core/logging';
import { BaseAgent, JsonSchema } from '../core/base-agent';
import { SQLExpert } from './sql-expert';
import { AdaptiveCardExpert } from './ac-expert';
import { pathToSrc } from '../utils';
import { ProgressUpdate } from '../core/progress';

const chatSchema: JsonSchema = {
    type: "object",
    properties: {
        text: {
            type: "string",
            description: "what you want to ask or say to the assistant."
        }
    },
    required: ["text"]
};

const acExpertSchema: JsonSchema = {
    type: "object",
    properties: {
        instructions: {
            type: "string",
            description: "instructions for the adaptive card expert"
        },
        visualization: {
            type: "string",
            enum: [
                'horizontal bar chart',
                'vertical bar chart', 
                'line chart',
                'pie chart',
                'table'
            ],
            description: "The type of visualization to create"
        },
        title: {
            type: "string",
            description: "The title for the visualization"
        },
        xAxis: {
            type: "string",
            description: "Label for the x-axis (for charts)."
        },
        xAxisFormat: {
            type: "string",
            enum: ['number', 'date'],
            description: "Format for the x-axis (for charts). Whether it should be a number or a date."
        },
        yAxis: {
            type: "string",
            description: "Label for the y-axis (for charts)"
        }
    },
    required: ["instructions", "visualization"]
};

const responseSchema: JsonSchema = {
    type: "object",
    properties: {
        content: {
            type: "array",
            description: "Array of content to format",
            items: {
                type: "object",
                oneOf: [
                    {
                        type: "object",
                        properties: {
                            type: { const: "text" },
                            text: {
                                type: "string",
                                description: "Text message to format for the user"
                            }
                        },
                        required: ["type", "text"]
                    },
                    {
                        type: "object",
                        properties: {
                            type: { const: "card" },
                            card: {
                                type: "object",
                                properties: {
                                    type: { const: "AdaptiveCard" },
                                    version: { const: "1.6" },
                                    body: {
                                        type: "array",
                                        items: { type: "object" }
                                    }
                                },
                                required: ["type", "version", "body"],
                                description: "Adaptive card to format"
                            }
                        },
                        required: ["type", "card"]
                    }
                ]
            }
        }
    },
    required: ["content"]
};

export type DataAnalystResponse = {
    text?: string;
    card?: Card;
}[];

export interface CommonAgentOptions {
    progressUpdate?: ProgressUpdate;
}

export const DataAnalyst = ({ progressUpdate }: CommonAgentOptions) => {
    const schemaPath = path.join(pathToSrc(), 'data', 'schema.sql');
    const dbSchema = fs.readFileSync(schemaPath, 'utf-8');
    const examplesPath = path.join(pathToSrc(), 'examples', 'data-analyst-examples.jsonl');
    const examples = JSON.parse(fs.readFileSync(examplesPath, 'utf-8'));

    const log = createLogger('data-analyst', 'DEBUG');

    const sql = SQLExpert({ progressUpdate });
    const card = AdaptiveCardExpert();

    const agent = new BaseAgent({
        systemMessage: [
            'You are an expert data analyst that helps users understand data from the AdventureWorks database.',
            'You work with three specialized experts to create clear, visual responses:',
            '',
            '1. SQL Expert - Retrieves data through database queries',
            '2. Adaptive Card Expert - Creates visual representations of data',
            '',
            'Your process:',
            '1. Understand what data the user needs. ',
            '       If their request is one of the following examples then simply return that. No need to call the SQL or Adaptive Card experts.',
            '       Do not feel obligated to follow the entire process if the user is asking for something simple.',
            '       Examples:',
            '           - "What do you do?"',
            '           - "What can you help me with?"',
            '2. Get the data through the SQL Expert',
            '3. Choose appropriate visualization types and create them through the Adaptive Card Expert:',
            '   - Use bar charts for comparing categories',
            '   - Use line charts for trends over time',
            '   - Use pie charts for showing proportions of a whole',
            '   - Use tables for detailed numeric data',
            '   - Consider vertical bars for many categories',
            '   - Use fact sets for simple lists or key-value pairs',
            '   - Always check if user specified a preferred visualization type:',
            '     * If they request a specific chart type, use that even if not optimal',
            '     * If they mention wanting to "see" or "visualize" something specific, adapt to that',
            '     * If they ask for a "breakdown" or "comparison", default to appropriate chart type',
            '   - Honor any user preferences about:',
            '     * Colors and styling',
            '     * How data should be grouped or arranged', 
            '     * Specific metrics or categories to highlight',
            '     * Level of detail (summary vs detailed)',
            '4. Package everything together send it back to the user.',
            '',
            'Important guidelines:',
            "- Focus on answering the user's question directly and simply",
            '- Always specify visualization type when requesting charts',
            '- Provide clear titles and axis labels for all charts',
            '- Choose visualizations that best represent the data:',
            '  * Bar charts: Category comparisons (e.g., sales by product)',
            '  * Line charts: Time series data (e.g., monthly trends). Dates should be in the format YYYY-MM-DD.',
            '    * Please explicitly mention the date format to the adaptive card expert.',
            '  * Pie charts: Part-to-whole relationships (max 6-7 segments)',
            '  * Tables: Detailed numeric data or multiple metrics',
            '- Keep explanations brief and clear',
            '- Let the visualizations do most of the talking',
            '- Always send both the data and visualizations back to the user.',
            '- Simply return the adaptive card generated by the Adaptive Card Expert, do not tamper with it.',
            '',
            'Examples:',
            ...examples.map((example: any) => [
                '---',
                `User: ${example.user_message}`,
                `Assistant: ${JSON.stringify(example.data_analyst_response, null, 0)}`,
            ].join('\n')),
            '',
            'Database Schema:',
            '```sql',
            dbSchema,
            '```',
        ].join('\n'),
        responseSchema: responseSchema,
        logger: log,
        maxLoops: 20,
    }).function(
        'sql-expert',
        'Ask the SQL expert to help you query and analyze the database',
        chatSchema,
        async ({ text }) => {
            progressUpdate?.update('PLANNING_QUERY');
            log.info(`Data Analyst -> SQL Expert`);
            const response = await sql.chat(text);
            log.info(`Data Analyst <- SQL Expert`);
            return response;
        }
    ).function(
        'ac-expert',
        'Ask the adaptive card expert to create visualizations of data.',
        acExpertSchema,
        async ({ instructions, visualization, title, xAxis, xAxisFormat, yAxis }) => {
            progressUpdate?.update('GENERATING_VISUALIZATION');
            let message = `Please create a ${visualization} visualization with the following instructions: ${instructions}.`;
            if (title) {
                message += ` Use "${title}" as the chart title.`;
            }
            if (xAxis) {
                message += ` Label the x-axis as "${xAxis}".`;
                if (xAxisFormat) {
                    const dateFormat = xAxisFormat === 'date' ? 'YYYY-MM-DD' : 'number';
                    message += ` The x-axis should be in the ${dateFormat} format.`;
                }
            }
            if (yAxis) {
                message += ` Label the y-axis as "${yAxis}".`;
            }

            log.info(`Data Analyst -> Adaptive Card Expert`);
            const response = await card.chat(message);
            log.info(`Data Analyst <- Adaptive Card Expert`);
            return response;
        }
    );

    return {
        chat: async (text: string): Promise<DataAnalystResponse> => {
            progressUpdate?.update('PROCESSING_MESSAGE');
            log.info(`Data Analyst Query: ${text}`);
            const response = await agent.chat(text);
            log.info(`Data Analyst Response: ${JSON.stringify(response, null, 2)}`);
            return response.content;
        }
    };
};
