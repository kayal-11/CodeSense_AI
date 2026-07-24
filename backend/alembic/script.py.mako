"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by new migrations.
revision = ${repr(up_revision)}
def down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
def depends_on = ${repr(depends_on)}
