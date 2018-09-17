# Build tool based on Docker and whatever (typically, Webpack) working together

TL,DR

The package offers a simple build tool based on `docker-compose`. It utilizes `build` instructions from `compose.yml`, runs corresponding build pipelines and manages to re-start the whole composition. You are free to write your own pipelines using `webpack nodejs api` or any other. The only thing you are obliged to do is to return a promise in the end, which you eventually resolve or reject. You are also capable to take the best from `Dockerfiles` by writing them in any way you like, using volumes, etc.

## Prerequisites

* docker daemon up and running
* docker-compose installed
* node 8 or higher

## Example

Let's say you have the following folder structure:

~~~~
project/
    app/
        app1/
            docker/
                development.dockerfile
            application.js
        app2/
            client/
            server/
            docker/
                development.dockerfile
            application.js
    docker/
        all.development.yml
    run.js  
~~~~

Whe have two apps there, united into one installation described in `all.development.yml`. For example, like this: 

~~~~
version: '3'
services:
  application1:
    build:
      context: ../app/app1/
      dockerfile: docker/development.dockerfile
    expose:
      - 3000
    ports:
      - 3000:3000
    restart: on-failure
    environment:
      - ROOT_URL=http://localhost:3000/
      - PORT=3000
  application2:
    build:
      context: ../app/app2/
      dockerfile: docker/development.docker
    expose:
      - 3100
    ports:
      - 3100:3100
    restart: on-failure
    environment:
      - ROOT_URL=http://localhost:3100/
      - PORT=3100
~~~~

There is also a script called `run.js`, which may look like the following:

~~~~
#!/usr/bin/env node

const Project = require('docker-webpack');
(new Project({
    name: 'project-name',
    composeFile: `${__dirname}/../docker/all.development.yml`,
})).run();
~~~~

Basically, it creates a project and spins it up.
Inside each project folder we have `application.js` file. This file describes how the application should be built. It might look like this:

~~~~
const Application = require('docker-webpack').Application;

module.exports = class Application1 extends Application {

    // this is important
    getRootFolder() {
        return __dirname;
    }

    // here we declare two tasks: one for a client and the other - for a server
    getTasks() {
        const rootFolder = this.getRootFolder();
        return [
            {
                files: [`${rootFolder}/client/src/**/*`], // the files chokidar will watch for changes
                folder: `${rootFolder}/client/`, // path to the task sub-folder
                action: this.buildClient.bind(this), // the build pipeline function
            },
            {
                files: [`${rootFolder}/server/src/**/*`], // the files chokidar will watch for changes
                folder: `${rootFolder}/server/`, // path to the task sub-folder
                action: this.buildServer.bind(this), // the build pipeline function
            },
        ];
    }

    async buildClient(context) {
        return new Promise((resolve, reject) => {
            // build something for client
            resolve();
        });
    }

    async buildServer(context) {
        return new Promise((resolve, reject) => {
            // build something for server, put files somewhere, then call resolve() in order to tell a build-tool to proceed
            resolve();
        });
    }
};
~~~~

Typically, inside `buildClient()` and `buildServer()` there should be a valid webpack (or whatever suits you) pipeline implemented. See examples of `application.js` files inside `examples/` folder of this repo.
And finally, our `development.dockerfile` may look like the following:

~~~~
FROM node:latest
RUN apt-get update && apt-get install -y --no-install-recommends vim && apt-get clean
WORKDIR /usr/src/app
RUN mkdir /usr/src/app/public/
RUN mkdir /usr/src/app/template/

# server is being changed way rearely, so it goes first
COPY ./server/package*.json ./
RUN npm install
COPY ./server/build/development/ .

# client assets, more frequent but still not so much
COPY ./client/public/ ./public/

# now bundled client here comes
# (you can use volumes instead of this, and then handle reloads through browsersync)
COPY ./client/build/development/ ./public/

CMD [ "npm", "start" ]
~~~~

To start the project, make `run.js` executable and run it:
~~~~
chmod +x ./run.js
./run.js
~~~~

I hope you will enjoy the module.
