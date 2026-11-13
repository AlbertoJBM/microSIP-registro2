FROM node:22-alpine3.22 AS dashboard-build
WORKDIR /src/dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

FROM golang:1.26-alpine3.22 AS server-build
WORKDIR /src
COPY server/go.mod ./server/go.mod
WORKDIR /src/server
RUN go mod download
COPY server/*.go ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/server .

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=server-build /out/server ./server
COPY --from=dashboard-build /src/dashboard/dist/ ./public/
COPY server/data/store-locations.json ./data/store-locations.json
EXPOSE 3001
ENTRYPOINT ["/app/server"]