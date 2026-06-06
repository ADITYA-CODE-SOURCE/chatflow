FROM maven:3.9.8-eclipse-temurin-17 AS build
WORKDIR /app

COPY pom.xml ./
RUN mvn -q -DskipTests dependency:go-offline

COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app

COPY --from=build /app/target/chatflow-backend-1.0.0.jar app.jar

EXPOSE 8080

ENTRYPOINT ["sh", "-c", "if [ -n \"$DATABASE_URL\" ] && [ -z \"$SPRING_DATASOURCE_URL\" ]; then CLEAN_URL=${DATABASE_URL#postgres://}; CLEAN_URL=${CLEAN_URL#postgresql://}; CREDS=${CLEAN_URL%@*}; HOST_DB=${CLEAN_URL#*@}; DB_NAME=${HOST_DB#*/}; HOST_PORT=${HOST_DB%%/*}; DB_USER=${CREDS%%:*}; DB_PASS=${CREDS#*:}; export SPRING_DATASOURCE_URL=jdbc:postgresql://${HOST_PORT}/${DB_NAME}; export SPRING_DATASOURCE_USERNAME=$DB_USER; export SPRING_DATASOURCE_PASSWORD=$DB_PASS; fi; exec java -XX:MaxRAMPercentage=75 -jar /app/app.jar"]
