# 1. Clone/download the project
cd project-root

# 2. Install Node dependencies
npm install express express-session mysql2 body-parser ldapauth-fork multer ldapjs

# 3. Start MySQL and import schema
mysql -u root -p < ber.sql

# 4. Create LDAP using docker
make changes in server.js file in LdapAuth and mysql.createPool change information about ldap and sql there for better functionality
# 5. Run the server
node server.js
